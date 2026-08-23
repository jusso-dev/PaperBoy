import assert from "node:assert/strict";
import test from "node:test";
import { prepareCloudflareEmailMessage } from "../src/lib/email-delivery.ts";
import {
  TemplateError,
  parseCreateTemplateInput,
  parseUpdateTemplateInput,
  previewTemplate,
  renderTemplate,
  renderTemplateForSend,
  templateSampleData,
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

test("preview lists missing required variables while optional variables stay blank", () => {
  const required = parseCreateTemplateInput({
    html: "<p>{{reader.name}} {{reader.nickname}}</p>",
    name: "Required reader",
    required_variables: ["reader.name"],
    subject: "Hello {{reader.name}}",
    text: "Hello {{reader.name}} from {{publication.name}}",
  });
  const preview = previewTemplate(required, { publication: { name: "News" } });

  assert.deepEqual(preview.missingVariables, ["reader.name"]);
  assert.equal(preview.subject, "Hello ");
  assert.equal(preview.html, "<p> </p>");
  assert.equal(preview.text, "Hello  from News");

  assert.throws(
    () => renderTemplateForSend(required, { publication: { name: "News" } }),
    (error) =>
      error instanceof TemplateError &&
      error.code === "MISSING_REQUIRED_VARIABLES" &&
      error.issues[0].field === "data.reader.name",
  );

  assert.equal(
    renderTemplateForSend(required, { reader: { name: "Ada" } }).subject,
    "Hello Ada",
  );
});

test("required variables must be referenced and variable paths cannot conflict", () => {
  assert.throws(
    () =>
      parseCreateTemplateInput({
        name: "Unused required path",
        required_variables: ["reader.email"],
        subject: "Hello {{reader.name}}",
        text: "Body",
      }),
    (error) =>
      error instanceof TemplateError &&
      error.issues.some((issue) => issue.field === "required_variables"),
  );

  assert.throws(
    () =>
      parseCreateTemplateInput({
        name: "Conflicting paths",
        subject: "Hello {{reader}} {{reader.name}}",
        text: "Body",
      }),
    (error) =>
      error instanceof TemplateError &&
      error.issues.some((issue) => /nested path/.test(issue.message)),
  );
});

test("sample JSON includes sibling dotted paths", () => {
  const sample = templateSampleData({
    html: "<p>{{reader.name}} {{reader.email}}</p>",
    subject: "{{publication.name}}",
    text: null,
  });

  assert.deepEqual(sample, {
    publication: { name: "Example publication.name" },
    reader: {
      email: "Example reader.email",
      name: "Example reader.name",
    },
  });
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

test("Cloudflare Email Sending receives required, rendered provider-neutral content", () => {
  const rendered = renderTemplateForSend(
    {
      ...definition,
      requiredVariables: ["publication.name", "reader.name"],
    },
    {
      publication: { name: "Daily Planet" },
      reader: { name: "Lois" },
    },
  );
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
