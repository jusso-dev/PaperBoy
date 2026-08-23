# PaperBoy

Self-hosted transactional email. A cheaper Resend you run on your own box.

![PaperBoy banner](docs/banner.jpg)

## Stack (locked)

- Next.js 16.3 App Router
- Instant navigation (no full reloads on dashboard routes)
- Drizzle ORM + Postgres
- Better Auth
- First-class MCP server over the same domain services as HTTP and the console
- CI on GitHub-hosted runners (`ubuntu-latest`) — repo is public, no self-hosted runners exposed to PRs

## Theme

Paper watermark (newsprint, cream stock). Light blue accent `#7EB8DA`. Ink `#1A1A1A`. No neon, no dark SaaS chrome.

## Database

PaperBoy uses PostgreSQL through Drizzle ORM. Set `DATABASE_URL` to an operator-controlled PostgreSQL instance hosted in the approved Australian region, then apply the in-repo migrations:

```sh
pnpm db:migrate
```

Generate a migration after changing `src/db/schema.ts` with `pnpm db:generate`.

All stored instants and public protocol timestamps are UTC. Each user has a persisted IANA timezone that controls console, log, and scheduling presentation.

The matching SQL in `drizzle/down/` exists only to prove rollback on a throwaway database. Do not run it against a database containing PaperBoy data.

## API keys

The console mints `pb_live_` and `pb_test_` bearer keys. A key contains a public identifier and a 256-bit secret; PostgreSQL stores the identifier and SHA-256 hash, never the raw key. The raw value is shown once. Revocation is enforced by the shared HTTP/MCP authentication boundary on the next request.

## Sending domains

Add a domain in the console or through MCP to get exact ownership and SPF TXT records, plus starter DMARC guidance. PaperBoy checks DNS from the application host. Ownership and SPF must both match before the domain becomes verified; a later failed check returns it to pending so live delivery cannot continue on stale state.

The default SPF value is `v=spf1 mx ~all`. Operators whose outbound host is not authorized by the domain's MX records must set `PAPERBOY_SPF_RECORD` to their exact policy before adding or checking domains. Publish only one SPF record. DKIM shows a reserved selector but no fake key: #9 generates the publishable public key and makes it part of verification.

Shared delivery policy blocks live keys unless the normalized From domain is verified in that key's organization. Test keys always resolve to the isolated test sink and never bypass into live delivery.

## MCP server

PaperBoy exposes the same organization-safe application services to agents through two MCP transports:

- Streamable HTTP at `https://<paperboy-host>/api/mcp`
- stdio with `pnpm mcp:stdio`

Streamable HTTP clients must send `Authorization: Bearer <PaperBoy API key>`. Local stdio clients provide `DATABASE_URL` and `PAPERBOY_API_KEY` through the child process environment:

```json
{
  "mcpServers": {
    "paperboy": {
      "command": "pnpm",
      "args": ["--dir", "/absolute/path/to/PaperBoy", "mcp:stdio"],
      "env": {
        "DATABASE_URL": "<injected database URL>",
        "PAPERBOY_API_KEY": "<injected PaperBoy API key>"
      }
    }
  }
}
```

Inject secrets through the agent runtime's secret or environment facility. Do not put keys in tool arguments, URLs, command-line arguments, source control, or logs.

The contract exposes capability/account context plus first-class domain list/create/verify/delete tools and authenticated configuration/operator-safety resources. Every tool schema carries `paperboy/schemaVersion`. Tenant context comes from the key; callers cannot select another organization. Domain mutations re-read the key creator's current membership and role, and deletion requires an explicit confirmation argument. MCP protocol timestamps are RFC 3339 UTC and identify `UTC` explicitly.

HTTP checks revocation on every request. Stdio checks at startup and before every tool call; after revocation, reconnect with a newly issued key. Tool schemas and non-tenant documentation may remain discoverable on an already-open stdio connection, but tenant operations fail immediately.

## What v1 does

Send transactional mail through an API that looks familiar if you have used Resend: API keys, domains, templates, events, webhooks. You run the MTA. PaperBoy does not sell you someone else's SMTP.

## What v1 does not do

- Not a marketing ESP with drag-and-drop campaigns as the core
- Not a closed hosted SaaS
- No third-party send vendor as the default path
