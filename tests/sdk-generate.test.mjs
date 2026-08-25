import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("OpenAPI SDK generation is scripted and runs on spec changes", async () => {
  const [script, workflow, ignoreTs, ignorePhp, readme, packageJson] =
    await Promise.all([
      readFile(new URL("../scripts/generate-sdks.sh", import.meta.url), "utf8"),
      readFile(
        new URL("../.github/workflows/sdk.yml", import.meta.url),
        "utf8",
      ),
      readFile(
        new URL("../sdk-generator/typescript.ignore", import.meta.url),
        "utf8",
      ),
      readFile(new URL("../sdk-generator/php.ignore", import.meta.url), "utf8"),
      readFile(new URL("../README.md", import.meta.url), "utf8"),
      readFile(new URL("../package.json", import.meta.url), "utf8"),
    ]);

  assert.match(script, /GENERATOR_VERSION="7\.24\.0"/);
  assert.match(script, /typescript-fetch/);
  assert.match(script, /generate php/);
  assert.match(script, /@paperboy\/openapi/);
  assert.match(script, /paperboy\/openapi/);
  assert.match(script, /--check/);
  assert.match(workflow, /openapi\.yaml/);
  assert.match(workflow, /\.\/scripts\/generate-sdks\.sh/);
  assert.match(workflow, /git commit/);
  assert.match(ignoreTs, /git_push\.sh/);
  assert.match(ignorePhp, /git_push\.sh/);
  assert.match(packageJson, /"sdk:generate": "\.\/scripts\/generate-sdks\.sh"/);
  assert.match(readme, /sdks\//);
  assert.match(readme, /sdk:generate/);
});

test("generated TypeScript and PHP clients exist for the HTTP surface", async () => {
  const [tsPackage, tsEmails, phpEmails, phpWebhooks] = await Promise.all([
    readFile(new URL("../sdks/typescript/package.json", import.meta.url), "utf8"),
    readFile(
      new URL("../sdks/typescript/src/apis/EmailsApi.ts", import.meta.url),
      "utf8",
    ),
    readFile(new URL("../sdks/php/src/Api/EmailsApi.php", import.meta.url), "utf8"),
    readFile(new URL("../sdks/php/src/Api/WebhooksApi.php", import.meta.url), "utf8"),
  ]);

  assert.match(tsPackage, /"name": "@paperboy\/openapi"/);
  assert.match(tsEmails, /sendEmail/);
  assert.match(tsEmails, /sendEmailBatch/);
  assert.match(phpEmails, /function sendEmail/);
  assert.match(phpWebhooks, /function configureWebhook/);
});
