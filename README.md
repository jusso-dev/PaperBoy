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

## Send API

`POST /api/v1/emails` accepts a Resend-shaped JSON body and returns the queued message ID:

```sh
curl https://paperboy.example/api/v1/emails \
  -H 'Authorization: Bearer <PaperBoy API key>' \
  -H 'Content-Type: application/json' \
  -H 'Idempotency-Key: order-123-receipt' \
  --data '{
    "from": "PaperBoy <news@mail.example.com>",
    "to": ["reader@example.net"],
    "subject": "Morning edition",
    "html": "<p>Hello</p>",
    "text": "Hello",
    "tags": [{"name": "edition", "value": "morning"}]
  }'
```

```json
{"id":"00000000-0000-4000-8000-000000000000"}
```

`to` accepts one address or an array of up to 50. Provide non-empty `html` or `text`; `subject` is required. Tags use `{name, value}` pairs with ASCII letters, numbers, underscores, or dashes. Invalid JSON returns 400. Invalid fields, including missing `from` or `to`, return structured JSON with 422.

A live key can queue only from a verified domain in its organization with an active PaperBoy DKIM key. A test key always queues to the isolated `test-sink` mode and cannot become live delivery. `Idempotency-Key` is optional, scoped to the API key, and limited to 256 visible ASCII characters. Repeating the same normalized request returns the original ID; changing the request under the same key returns 409.

The queue stores semantic `from`, `to`, subject, HTML/text, and tags rather than prebuilt MIME. This leaves Date and DKIM ownership to the selected outbound adapter: a self-hosted SMTP path can use PaperBoy signing, while Cloudflare Email Sending can construct and sign its provider-managed message without double-signing. This endpoint persists `queued` rows; the outbound worker is a separate deployment component.

Message instants are PostgreSQL `timestamptz` values. MCP exposes them as RFC 3339 UTC; future console presentation uses the signed-in user's persisted IANA timezone.

## Sending domains

Add a domain in the console or through MCP to get exact ownership, SPF, and DKIM TXT records, plus starter DMARC guidance. PaperBoy checks DNS from the application host. Ownership, SPF, and an active DKIM selector must match before the domain becomes verified; a later failed check returns it to pending so live delivery cannot continue on stale state.

The default SPF value is `v=spf1 mx ~all`. Operators whose outbound host is not authorised by the domain's MX records must set `PAPERBOY_SPF_RECORD` to their exact policy before adding or checking domains. Publish only one SPF record at each owner name. The [DNS operator guide](docs/dns.md) gives exact direct-IP, Cloudflare Email Routing, Cloudflare Email Sending, and staged DMARC instructions; authenticated MCP clients can read the identical guide at `paperboy://docs/dns`.

Set `PAPERBOY_DKIM_ENCRYPTION_KEY` to a base64-encoded 32-byte random value before adding domains or managing DKIM. For example, generate it in the deployment secret store with `openssl rand -base64 32`; do not put the result in source control, command-line arguments, or logs. PaperBoy stores each RSA private key in PostgreSQL inside a context-bound AES-256-GCM envelope. Console, API, and MCP responses expose only selector/public DNS material.

Rotation is staged: PaperBoy keeps signing with the active selector while the replacement is pending. A DNS check activates the replacement only after its public key resolves, moves the old selector to retiring, and keeps both DNS instructions visible. Finalising rotation destroys the retiring encrypted private key. Stored lifecycle instants are UTC; console presentation uses the signed-in user's persisted IANA timezone.

### Cloudflare Email compatibility

Cloudflare DNS and [Email Routing](https://developers.cloudflare.com/email-service/configuration/domains/) can coexist with PaperBoy signing. PaperBoy selectors start with `pb` and do not collide with Cloudflare's `cf-bounce` or `cf2024-1` selectors. Keep both providers' DKIM TXT records. If Email Routing manages the root SPF record, merge PaperBoy's sending mechanism into a single record; for an MX-authorised PaperBoy MTA the value is `v=spf1 mx include:_spf.mx.cloudflare.net ~all`. Set that complete value in `PAPERBOY_SPF_RECORD`; never publish two `v=spf1` records.

[Cloudflare Email Sending](https://developers.cloudflare.com/email-service/reference/headers/) is different: Cloudflare controls `Date` and `DKIM-Signature` and signs with its provider-managed selector. The Cloudflare transport boundary therefore rejects a pre-signed or pre-dated raw message and does not decrypt a PaperBoy key. SMTP/self-hosted MTA delivery uses PaperBoy's verified active key. This keeps both paths valid without double-signing or leaking private material.

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
        "PAPERBOY_API_KEY": "<injected PaperBoy API key>",
        "PAPERBOY_DKIM_ENCRYPTION_KEY": "<injected base64-encoded 32-byte key>"
      }
    }
  }
}
```

Inject secrets through the agent runtime's secret or environment facility. Do not put keys in tool arguments, URLs, command-line arguments, source control, or logs.

The contract exposes capability/account context plus first-class domain list/create/verify/delete and DKIM setup/rotate/finalise tools, with authenticated configuration, operator-safety, and DNS operator resources. Every tool schema carries `paperboy/schemaVersion`. Tenant context comes from the key; callers cannot select another organization. Domain and DKIM mutations re-read the key creator's current membership and role; destructive deletion/finalisation requires explicit confirmation. MCP protocol timestamps are RFC 3339 UTC and identify `UTC` explicitly. DKIM output contains public DNS material and lifecycle metadata only.

HTTP checks revocation on every request. Stdio checks at startup and before every tool call; after revocation, reconnect with a newly issued key. Tool schemas and non-tenant documentation may remain discoverable on an already-open stdio connection, but tenant operations fail immediately.

## What v1 does

Send transactional mail through an API that looks familiar if you have used Resend: API keys, domains, templates, events, webhooks. You run the MTA. PaperBoy does not sell you someone else's SMTP.

## What v1 does not do

- Not a marketing ESP with drag-and-drop campaigns as the core
- Not a closed hosted SaaS
- No third-party send vendor as the default path
