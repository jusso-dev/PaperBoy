import { OpenApiReference } from "@/components/docs/openapi-reference";
import { parseOpenApiDocument, readOpenApiSpec } from "@/lib/openapi-document";

export default async function ApiDocsPage() {
  const document = parseOpenApiDocument(await readOpenApiSpec());

  return (
    <section className="dashboard-wide">
      <h1 className="page-title">API reference</h1>
      <p className="page-sub">
        {document.title} {document.version}. Bearer keys select one organization
        and one live or test environment. Protocol timestamps stay UTC.
      </p>
      <div className="card">
        <h2>Contract</h2>
        <p>{document.description}</p>
        <p>
          Download the linted OpenAPI 3.1 document or call the same routes with
          the Rust CLI.
        </p>
        <div className="openapi-toolbar">
          <a className="btn btn-primary btn-compact" href="/openapi.yaml">
            Download openapi.yaml
          </a>
          <a
            className="btn btn-compact"
            href="https://github.com/jusso-dev/PaperBoy/tree/main/crates/paperboy"
          >
            Rust CLI
          </a>
        </div>
      </div>
      <OpenApiReference document={document} />
    </section>
  );
}
