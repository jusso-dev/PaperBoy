import assert from "node:assert/strict";
import test from "node:test";
import { prepareCloudflareEmailMessage } from "../src/lib/email-delivery.ts";
import {
  TemplateError,
  parseCreateTemplateInput,
  parseUpdateTemplateInput,
  renderTemplate,
} from "../src/lib/template-core.ts";

const definition = parseCreateTemplateInput({
  html: "<h1>Hello {{reader.name}}</h1><p>{{publication.name}}</p>",
  name: "Welcome reader",
  subject: "Welcome, {{reader.name}}",
  text: "Hello {{reader.name}} from {{publication.name}}",
});

test("renders dotted subject, HTML, and text variables without evaluation", () => {
  const rendered = renderTemplate(definition, {
    publication: { name: "PaperBoy & Co" },
    reader: { name: "Ada <admin@example.com>" },
  });

  assert.equal(rendered.subject, "Welcome, Ada <admin@example.com>");
  assert.equal(
    rendered.html,
    "<h1>Hello Ada &lt;admin@example.com&gt;</h1><p>PaperBoy &amp; Co</p>",
  );
  assert.equal(
    rendered.text,
    "Hello Ada <admin@example.com> from PaperBoy & Co",
  );
});

test("missing variables become empty text", () => {
  const rendered = renderTemplate(definition, {});

  assert.equal(rendered.subject, "Welcome, ");
  assert.equal(rendered.html, "<h1>Hello </h1><p></p>");
  assert.equal(rendered.text, "Hello  from ");
});

test("rejects helpers, sections, triple braces, expressions, and prototype paths", () => {
  for (const subject of [
    "{{#reader}}Hello{{/reader}}",
    "{{uppercase reader.name}}",
    "{{{reader.name}}}",
    "{{reader.name + 1}}",
    "{{reader.constructor}}",
    "{{reader.name",
  ]) {
    assert.throws(
      () =>
        parseCreateTemplateInput({
          name: "Unsafe",
          subject,
          text: "Body",
        }),
      (error) =>
        error instanceof TemplateError && error.code === "VALIDATION_ERROR",
      subject,
    );
  }
});

test("rejects non-object, array, unsafe-key, and object-leaf data", () => {
  for (const data of [
    null,
    [],
    { reader: ["Ada"] },
    JSON.parse('{"__proto__":"bad"}'),
  ]) {
    assert.throws(
      () => renderTemplate(definition, data),
      (error) =>
        error instanceof TemplateError && error.code === "VALIDATION_ERROR",
    );
  }

  assert.throws(
    () =>
      renderTemplate(
        { html: null, subject: "Hello {{reader}}", text: "Body" },
        { reader: { name: "Ada" } },
      ),
    (error) =>
      error instanceof TemplateError &&
      error.issues.some((issue) => issue.field === "data.reader"),
  );
});

test("template data has an exact 256 KiB JSON limit", () => {
  assert.throws(
    () => renderTemplate(definition, { reader: { name: "x".repeat(256 * 1024) } }),
    (error) =>
      error instanceof TemplateError &&
      error.issues.some((issue) => /256 KiB/.test(issue.message)),
  );
});

test("rendered output is bounded before repeated substitutions allocate it", () => {
  assert.throws(
    () =>
      renderTemplate(
        {
          html: null,
          subject: "Safe",
          text: "{{value}}".repeat(9),
        },
        { value: "x".repeat(250 * 1024) },
      ),
    (error) =>
      error instanceof TemplateError &&
      error.issues.some(
        (issue) => issue.field === "text" && /2 MiB/.test(issue.message),
      ),
  );
});

test("partial updates preserve omitted fields and can clear one body format", () => {
  const updated = parseUpdateTemplateInput(
    { html: null, subject: "Updated {{reader.name}}" },
    definition,
  );

  assert.equal(updated.name, definition.name);
  assert.equal(updated.html, null);
  assert.equal(updated.text, definition.text);
  assert.equal(updated.subject, "Updated {{reader.name}}");

  assert.throws(
    () => parseUpdateTemplateInput({ html: null, text: null }, definition),
    (error) =>
      error instanceof TemplateError &&
      error.issues.some((issue) => issue.field === "body"),
  );
});

test("Cloudflare Email Sending receives the rendered provider-neutral content", () => {
  const rendered = renderTemplate(definition, {
    publication: { name: "Daily Planet" },
    reader: { name: "Lois" },
  });
  const payload = prepareCloudflareEmailMessage({
    attachments: [],
    from: "news@example.com",
    ...rendered,
    to: ["lois@example.net"],
  });

  assert.equal(payload.subject, "Welcome, Lois");
  assert.equal(
    payload.html,
    "<h1>Hello Lois</h1><p>Daily Planet</p>",
  );
  assert.equal(payload.text, "Hello Lois from Daily Planet");
  assert.equal("date" in payload, false);
  assert.equal("dkim" in payload, false);
});
