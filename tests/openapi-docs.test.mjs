import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("console documents OpenAPI routes and ships the spec", async () => {
  const [sidebar, page, route, dockerfile, readme] = await Promise.all([
    readFile(
      new URL("../src/components/dashboard/dashboard-sidebar.tsx", import.meta.url),
      "utf8",
    ),
    readFile(new URL("../src/app/app/docs/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/app/openapi.yaml/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../Dockerfile", import.meta.url), "utf8"),
    readFile(new URL("../README.md", import.meta.url), "utf8"),
  ]);

  assert.match(sidebar, /href: "\/app\/docs"/);
  assert.match(sidebar, /label: "API docs"/);
  assert.match(page, /OpenApiReference/);
  assert.match(page, /href="\/openapi.yaml"/);
  assert.match(route, /readOpenApiSpec/);
  assert.match(dockerfile, /openapi.yaml/);
  assert.match(readme, /crates\/paperboy/);
  assert.match(readme, /\/app\/docs/);
});
