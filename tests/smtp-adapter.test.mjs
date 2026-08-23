import assert from "node:assert/strict";
import test from "node:test";
import { simpleParser } from "mailparser";
import {
  createSmtpAdapter,
  smtpTransportOptions,
} from "../src/lib/smtp-adapter.ts";
import { OutboundDeliveryError } from "../src/lib/worker-core.ts";

const fixedNow = new Date("2026-08-23T03:04:05.000Z");

function message(overrides = {}) {
  return {
    attemptCount: 1,
    attachments: [
      {
        content: Buffer.from("private attachment"),
        contentType: "text/plain",
        filename: "edition.txt",
      },
    ],
    deliveryMode: "live",
    environment: "live",
    from: "PaperBoy <News@Example.COM>",
    html: "<p>Private edition</p>",
    id: "11111111-1111-4111-8111-111111111111",
    subject: "Morning edition",
    text: "Private edition",
    to: ["Reader@Example.NET"],
    ...overrides,
  };
}

function fakeTransport(overrides = {}) {
  const calls = [];
  let closed = false;
  const client = {
    close() {
      closed = true;
    },
    async sendMail(options) {
      calls.push(options);
      return { accepted: ["reader@example.net"], rejected: [] };
    },
    async verify() {
      return true;
    },
    ...overrides,
  };

  return {
    calls,
    client,
    isClosed: () => closed,
  };
}

test("SMTP configuration requires STARTTLS by default", () => {
  const options = smtpTransportOptions({
    SMTP_URL: "smtp://worker:p%40ss@mail.example.com:2525",
  });

  assert.equal(options.host, "mail.example.com");
  assert.equal(options.port, 2525);
  assert.equal(options.secure, false);
  assert.equal(options.requireTLS, true);
  assert.equal(options.ignoreTLS, false);
  assert.deepEqual(options.auth, { pass: "p@ss", user: "worker" });
  assert.equal(options.connectionTimeout, 30_000);
  assert.equal(options.socketTimeout, 120_000);
  assert.equal("url" in options, false);
});

test("SMTP configuration makes weaker TLS behavior explicit", () => {
  const opportunistic = smtpTransportOptions({
    SMTP_TLS_MODE: "opportunistic",
    SMTP_URL: "smtp://mail.example.com",
  });
  const localDev = smtpTransportOptions({
    SMTP_TLS_MODE: "disabled",
    SMTP_URL: "smtp://127.0.0.1:1025",
  });
  const implicit = smtpTransportOptions({
    SMTP_URL: "smtps://worker:secret@mail.example.com",
  });

  assert.equal(opportunistic.port, 587);
  assert.equal(opportunistic.opportunisticTLS, true);
  assert.equal(opportunistic.requireTLS, false);
  assert.equal(localDev.ignoreTLS, true);
  assert.equal(localDev.requireTLS, false);
  assert.equal(implicit.port, 465);
  assert.equal(implicit.secure, true);
});

test("Cloudflare Email uses authenticated implicit TLS through the SMTP adapter", () => {
  const options = smtpTransportOptions({
    SMTP_URL:
      "smtps://api_token:test-token@smtp.mx.cloudflare.net:465",
  });

  assert.equal(options.host, "smtp.mx.cloudflare.net");
  assert.equal(options.port, 465);
  assert.equal(options.secure, true);
  assert.deepEqual(options.auth, {
    pass: "test-token",
    user: "api_token",
  });
});

test("SMTP configuration rejects ambiguous or unsafe URLs", () => {
  const invalidEnvironments = [
    {},
    { SMTP_URL: "" },
    { SMTP_URL: " https://mail.example.com" },
    { SMTP_URL: "http://mail.example.com" },
    { SMTP_URL: "smtp://mail.example.com/private" },
    { SMTP_URL: "smtp://mail.example.com?requireTLS=false" },
    { SMTP_URL: "smtp://worker@mail.example.com" },
    {
      SMTP_TLS_MODE: "disabled",
      SMTP_URL: "smtps://worker:secret@mail.example.com",
    },
    { SMTP_TLS_MODE: "sometimes", SMTP_URL: "smtp://mail.example.com" },
  ];

  for (const environment of invalidEnvironments) {
    assert.throws(
      () => smtpTransportOptions(environment),
      (error) =>
        error instanceof Error &&
        error.name === "SmtpConfigurationError" &&
        !error.message.includes("secret"),
    );
  }
});

test("SMTP adapter hands one complete MIME message to the configured MTA", async () => {
  const fake = fakeTransport();
  let receivedOptions;
  const adapter = createSmtpAdapter({
    environment: {
      SMTP_TLS_MODE: "disabled",
      SMTP_URL: "smtp://127.0.0.1:1025",
    },
    now: () => fixedNow,
    transportFactory(options) {
      receivedOptions = options;
      return fake.client;
    },
  });

  await adapter.verify();
  await adapter.send(message());
  adapter.close();

  assert.equal(receivedOptions.host, "127.0.0.1");
  assert.equal(fake.calls.length, 1);
  assert.deepEqual(fake.calls[0].envelope, {
    from: "news@example.com",
    to: ["reader@example.net"],
  });
  assert.equal(fake.calls[0].disableFileAccess, true);
  assert.equal(fake.calls[0].disableUrlAccess, true);

  const parsed = await simpleParser(fake.calls[0].raw);
  assert.equal(parsed.subject, "Morning edition");
  assert.equal(parsed.messageId, "<11111111-1111-4111-8111-111111111111@example.com>");
  assert.equal(parsed.date.toISOString(), fixedNow.toISOString());
  assert.equal(parsed.attachments[0].filename, "edition.txt");
  assert.deepEqual(
    parsed.attachments[0].content,
    Buffer.from("private attachment"),
  );
  assert.equal(fake.isClosed(), true);
});

test("SMTP response classes become safe retry decisions", async () => {
  const cases = [
    {
      expectedCode: "smtp_451",
      failure: { response: "private relay response", responseCode: 451 },
      retryable: true,
    },
    {
      expectedCode: "smtp_550",
      failure: { response: "private recipient response", responseCode: 550 },
      retryable: false,
    },
    {
      expectedCode: "smtp_configuration_error",
      failure: { code: "EAUTH", response: "private credential response" },
      retryable: false,
    },
    {
      expectedCode: "smtp_connection_error",
      failure: { code: "ECONNRESET", hostname: "private.internal" },
      retryable: true,
    },
  ];

  for (const scenario of cases) {
    const fake = fakeTransport({
      async sendMail() {
        throw scenario.failure;
      },
    });
    const adapter = createSmtpAdapter({
      environment: {
        SMTP_TLS_MODE: "disabled",
        SMTP_URL: "smtp://127.0.0.1:1025",
      },
      transportFactory: () => fake.client,
    });

    await assert.rejects(
      adapter.send(message()),
      (error) =>
        error instanceof OutboundDeliveryError &&
        error.code === scenario.expectedCode &&
        error.retryable === scenario.retryable &&
        !error.reason.includes("private"),
    );
  }
});

test("partial SMTP acceptance is permanent to avoid duplicate recipients", async () => {
  const fake = fakeTransport({
    async sendMail() {
      return {
        accepted: ["first@example.net"],
        rejected: ["second@example.net"],
      };
    },
  });
  const adapter = createSmtpAdapter({
    environment: {
      SMTP_TLS_MODE: "disabled",
      SMTP_URL: "smtp://127.0.0.1:1025",
    },
    transportFactory: () => fake.client,
  });

  await assert.rejects(
    adapter.send(
      message({ to: ["first@example.net", "second@example.net"] }),
    ),
    (error) =>
      error instanceof OutboundDeliveryError &&
      error.code === "smtp_recipient_rejected" &&
      error.retryable === false,
  );
});

test("SMTP adapter rejects test-sink messages", async () => {
  const fake = fakeTransport();
  const adapter = createSmtpAdapter({
    environment: { SMTP_URL: "smtp://mail.example.com" },
    transportFactory: () => fake.client,
  });

  await assert.rejects(
    adapter.send(
      message({ deliveryMode: "test-sink", environment: "test" }),
    ),
    (error) =>
      error instanceof OutboundDeliveryError &&
      error.code === "adapter_mode_mismatch" &&
      error.retryable === false,
  );
  assert.equal(fake.calls.length, 0);
});
