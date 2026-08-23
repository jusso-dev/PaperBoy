import nodemailer, { type SendMailOptions } from "nodemailer";
import type SMTPTransport from "nodemailer/lib/smtp-transport";
import { buildSmtpMimeMessage } from "@/lib/email-delivery";
import { normalizeEmailAddress } from "@/lib/email-core";
import {
  OutboundDeliveryError,
  type OutboundAdapter,
  smtpDeliveryError,
} from "@/lib/worker-core";

export const SMTP_TLS_MODES = [
  "required",
  "opportunistic",
  "disabled",
] as const;

export type SmtpTlsMode = (typeof SMTP_TLS_MODES)[number];

type SmtpSendResult = {
  accepted: unknown[];
  rejected: unknown[];
};

type SmtpSendMailOptions = SendMailOptions & {
  dsn?: {
    id: string;
    notify: ("delay" | "failure")[];
    return: "headers";
  };
};

export type SmtpTransportClient = {
  close: () => void;
  sendMail: (options: SmtpSendMailOptions) => Promise<SmtpSendResult>;
  verify: () => Promise<true>;
};

type SmtpAdapterInput = {
  environment?: Readonly<Record<string, string | undefined>>;
  now?: () => Date;
  transportFactory?: (
    options: SMTPTransport.Options,
  ) => SmtpTransportClient;
};

const PERMANENT_SMTP_ERROR_CODES = new Set([
  "EAUTH",
  "EENVELOPE",
  "EMESSAGE",
  "ESTREAM",
]);

function configurationError(message: string): Error {
  const error = new Error(message);
  error.name = "SmtpConfigurationError";
  return error;
}

function decodeCredential(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    throw configurationError("SMTP_URL contains invalid credentials.");
  }
}

function tlsMode(
  environment: Readonly<Record<string, string | undefined>>,
): SmtpTlsMode {
  const configured = environment.SMTP_TLS_MODE ?? "required";

  if (!SMTP_TLS_MODES.includes(configured as SmtpTlsMode)) {
    throw configurationError(
      "SMTP_TLS_MODE must be required, opportunistic, or disabled.",
    );
  }

  return configured as SmtpTlsMode;
}

export function configuredBounceAddress(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): string | null {
  const configured = environment.PAPERBOY_BOUNCE_ADDRESS;

  if (configured === undefined) return null;

  const normalized = normalizeEmailAddress(configured);

  if (!normalized || configured !== configured.trim() || /[<>\r\n]/.test(configured)) {
    throw configurationError(
      "PAPERBOY_BOUNCE_ADDRESS must be one plain email address.",
    );
  }

  return normalized;
}

export function smtpTransportOptions(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): SMTPTransport.Options {
  const configuredUrl = environment.SMTP_URL;

  if (!configuredUrl || configuredUrl !== configuredUrl.trim()) {
    throw configurationError(
      "SMTP_URL must be a valid smtp:// or smtps:// URL.",
    );
  }

  let parsed: URL;

  try {
    parsed = new URL(configuredUrl);
  } catch {
    throw configurationError(
      "SMTP_URL must be a valid smtp:// or smtps:// URL.",
    );
  }

  if (parsed.protocol !== "smtp:" && parsed.protocol !== "smtps:") {
    throw configurationError("SMTP_URL must use smtp:// or smtps://.");
  }

  if (
    !parsed.hostname ||
    (parsed.pathname !== "" && parsed.pathname !== "/") ||
    parsed.search ||
    parsed.hash
  ) {
    throw configurationError(
      "SMTP_URL must contain only a host, optional port, and optional credentials.",
    );
  }

  const mode = tlsMode(environment);
  const secure = parsed.protocol === "smtps:";

  if (secure && mode !== "required") {
    throw configurationError(
      "smtps:// uses implicit TLS and requires SMTP_TLS_MODE=required.",
    );
  }

  const hasUsername = parsed.username.length > 0;
  const hasPassword = parsed.password.length > 0;

  if (hasUsername !== hasPassword) {
    throw configurationError(
      "SMTP_URL credentials must include both username and password.",
    );
  }

  const port = parsed.port
    ? Number(parsed.port)
    : secure
      ? 465
      : 587;

  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw configurationError("SMTP_URL contains an invalid port.");
  }

  const host = parsed.hostname.startsWith("[")
    ? parsed.hostname.slice(1, -1)
    : parsed.hostname;
  const options: SMTPTransport.Options = {
    connectionTimeout: 30_000,
    dnsTimeout: 15_000,
    greetingTimeout: 15_000,
    host,
    port,
    secure,
    socketTimeout: 120_000,
  };

  if (hasUsername && hasPassword) {
    options.auth = {
      pass: decodeCredential(parsed.password),
      user: decodeCredential(parsed.username),
    };
  }

  if (!secure) {
    if (mode === "required") {
      options.ignoreTLS = false;
      options.requireTLS = true;
    } else if (mode === "opportunistic") {
      options.ignoreTLS = false;
      options.opportunisticTLS = true;
      options.requireTLS = false;
    } else {
      options.ignoreTLS = true;
      options.requireTLS = false;
    }
  }

  return options;
}

function smtpError(error: unknown): OutboundDeliveryError {
  if (error && typeof error === "object") {
    const candidate = error as { code?: unknown; responseCode?: unknown };

    if (
      typeof candidate.responseCode === "number" &&
      Number.isInteger(candidate.responseCode)
    ) {
      return smtpDeliveryError(candidate.responseCode);
    }

    if (
      typeof candidate.code === "string" &&
      PERMANENT_SMTP_ERROR_CODES.has(candidate.code)
    ) {
      return new OutboundDeliveryError({
        code: "smtp_configuration_error",
        reason: "SMTP rejected the configured sender, recipient, message, or credentials.",
        retryable: false,
      });
    }
  }

  return new OutboundDeliveryError({
    code: "smtp_connection_error",
    reason: "SMTP connection failed before delivery completed.",
    retryable: true,
  });
}

export function createSmtpAdapter(
  input: SmtpAdapterInput = {},
): OutboundAdapter & { close: () => void; verify: () => Promise<void> } {
  const options = smtpTransportOptions(input.environment);
  const transportFactory =
    input.transportFactory ??
    ((transportOptions: SMTPTransport.Options) =>
      nodemailer.createTransport(transportOptions) as SmtpTransportClient);
  const transport = transportFactory(options);
  const now = input.now ?? (() => new Date());
  const bounceAddress = configuredBounceAddress(input.environment);

  return {
    name: "smtp",
    close() {
      transport.close();
    },
    async verify() {
      try {
        await transport.verify();
      } catch (error) {
        throw smtpError(error);
      }
    },
    async send(message) {
      if (message.deliveryMode !== "live") {
        throw new OutboundDeliveryError({
          code: "adapter_mode_mismatch",
          reason: "The SMTP adapter accepts live delivery only.",
          retryable: false,
        });
      }

      const envelopeFrom =
        bounceAddress ?? normalizeEmailAddress(message.from);
      const envelopeTo = message.to.map(normalizeEmailAddress);

      if (!envelopeFrom || envelopeTo.some((address) => !address)) {
        throw new OutboundDeliveryError({
          code: "invalid_envelope",
          reason: "The queued SMTP envelope is invalid.",
          retryable: false,
        });
      }

      const senderDomain = envelopeFrom.slice(envelopeFrom.lastIndexOf("@") + 1);
      const raw = await buildSmtpMimeMessage({
        ...message,
        date: now(),
        headers: { "X-PaperBoy-Message-ID": message.id },
        messageId: `<${message.id}@${senderDomain}>`,
      });

      try {
        const result = await transport.sendMail({
          disableFileAccess: true,
          disableUrlAccess: true,
          dsn: {
            id: message.id,
            notify: ["failure", "delay"],
            return: "headers",
          },
          envelope: {
            from: envelopeFrom,
            to: envelopeTo as string[],
          },
          raw,
        });

        if (
          result.rejected.length > 0 ||
          result.accepted.length !== envelopeTo.length
        ) {
          throw new OutboundDeliveryError({
            code: "smtp_recipient_rejected",
            reason: "SMTP rejected one or more recipients after accepting the message transaction.",
            retryable: false,
          });
        }
      } catch (error) {
        if (error instanceof OutboundDeliveryError) {
          throw error;
        }
        throw smtpError(error);
      }
    },
  };
}
