import { readOpenApiSpec } from "@/lib/openapi-document";

export async function GET() {
  return new Response(await readOpenApiSpec(), {
    headers: {
      "Cache-Control": "public, max-age=60",
      "Content-Disposition": 'inline; filename="openapi.yaml"',
      "Content-Type": "application/yaml; charset=utf-8",
    },
  });
}
