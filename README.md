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

`to` accepts one address or an array of up to 50. For inline content, provide `subject` and non-empty `html` or `text`. A template send uses `template_id` and optional `data` instead. Tags use `{name, value}` pairs with ASCII letters, numbers, underscores, or dashes. Invalid JSON returns 400. Invalid fields, including missing `from` or `to`, return structured JSON with 422.

Single sends accept up to 100 private attachments as `{content, filename, content_type}`. `content` must be canonical Base64; filenames cannot contain paths or control characters; MIME types use forms such as `application/pdf` or `image/png`. Decoded attachment bytes may total at most 10 MiB per message, with an HTTP 413 response above that limit. The batch endpoint intentionally rejects attachments.

Set `PAPERBOY_ATTACHMENT_STORAGE_PATH` to a dedicated absolute path on a private local or shared Australian-hosted volume. PaperBoy creates generated tenant/message blob keys with directory mode `0700` and file mode `0600`; it never uses the submitted filename as a path and never creates a public download URL. PostgreSQL stores only attachment metadata, byte size, SHA-256 integrity hash, and the opaque storage key. The application and future worker must mount the same path.

A live key can queue only from a verified domain in its organization with an active PaperBoy DKIM key. A test key always queues to the isolated `test-sink` mode and cannot become live delivery. `Idempotency-Key` is optional, scoped to the API key, and limited to 256 visible ASCII characters. Repeating the same normalized request returns the original ID; changing the request under the same key returns 409.

`POST /api/v1/emails/batch` accepts a bare JSON array of 1 to 100 messages. A fully valid batch returns IDs in input order using the familiar `data` envelope:

```sh
curl https://paperboy.example/api/v1/emails/batch \
  -H 'Authorization: Bearer <PaperBoy API key>' \
  -H 'Content-Type: application/json' \
  --data '[
    {"from":"news@mail.example.com","to":"first@example.net","subject":"First","text":"Hello"},
    {"from":"news@mail.example.com","to":"second@example.net","subject":"Second","text":"Hello"}
  ]'
```

```json
{"data":[{"id":"00000000-0000-4000-8000-000000000001"},{"id":"00000000-0000-4000-8000-000000000002"}]}
```

Each item is validated and queued independently under the same API-key and domain rules. Inline and template-backed items can be mixed in one batch. Mixed success returns HTTP 207 with each array position containing either `{id}` or a structured `{error}`; valid neighbors are not dropped. Invalid envelopes return 422. Batch idempotency is not available yet, so an `Idempotency-Key` fails explicitly instead of being ignored.

The queue stores semantic `from`, `to`, subject, HTML/text, tags, and private attachment references rather than prebuilt MIME. This leaves Date and DKIM ownership to the selected outbound adapter: a self-hosted SMTP path builds MIME with the stored bytes and can use PaperBoy signing, while Cloudflare Email Sending receives structured Base64 attachments and constructs and signs its provider-managed message without double-signing. This endpoint persists `queued` rows; the outbound worker is a separate deployment component.

Message instants are PostgreSQL `timestamptz` values. MCP exposes them as RFC 3339 UTC; console presentation uses the signed-in user's persisted IANA timezone.

## Email templates

Templates are organization-owned records with a case-insensitively unique name, subject, at least one of HTML or plain text, and an explicit `required_variables` list. Owners and admins manage them in the console; members can read and preview them. The console formats template timestamps using the signed-in user's persisted IANA timezone. REST timestamps and MCP timestamps are RFC 3339 UTC.

The bearer-key REST surface is:

- `GET /api/v1/templates` and `POST /api/v1/templates`
- `GET`, `PATCH`, and `DELETE /api/v1/templates/:templateId`
- `POST /api/v1/templates/:templateId/preview` with `{ "data": { ... } }`

REST tenant context always comes from the key. Template CRUD also re-checks the key creator's current organization membership and role. A missing or cross-organization template returns 404; duplicate names return 409. API responses never accept a caller-supplied organization ID.

Template variables use dotted double braces such as `{{reader.name}}`. PaperBoy deliberately supports no helpers, sections, expressions, triple braces, or executable template code. Data must be a bounded JSON object containing nested objects and scalar values; arrays and prototype-sensitive keys are rejected. HTML substitutions are escaped, while subject and plain-text substitutions remain text. Missing optional variables render as empty text. Missing required variables are listed by preview and return `missing_template_variables` with field-level details from send; they never silently queue a partial message.

The dedicated console preview route opens with generated sample JSON and renders without a full document navigation. It never queues or sends mail. HTML preview runs in a sandboxed iframe with scripts, form submission, top-level navigation, credentialed same-origin access, and remote subresources blocked; referrers are suppressed. Rendered subject, plain text, source, and every missing required path remain visible outside the frame.

Queue a template through the single or batch send API with the normal envelope fields plus `template_id` and optional `data`:

```json
{
  "from": "PaperBoy <news@mail.example.com>",
  "to": "reader@example.net",
  "template_id": "00000000-0000-4000-8000-000000000000",
  "data": {"reader": {"name": "Ada"}}
}
```

Do not combine `template_id` with inline `subject`, `html`, or `text`. PaperBoy resolves and validates rendered content before calculating idempotency or persisting the message. The stored queue record therefore contains the exact semantic content delivered later. SMTP MIME and Cloudflare Email Sending's structured payload are built from that same rendered subject, HTML, and text; Cloudflare remains responsible for its own Date and DKIM signature.

### Simple broadcasts

`POST /api/v1/broadcasts` sends one stored template now to a one-off audience snapshot of 1-100 unique addresses:

```json
{
  "name": "Morning edition",
  "from": "Newsroom <news@example.com>",
  "template_id": "00000000-0000-4000-8000-000000000000",
  "audience": [
    { "email": "reader@example.net", "data": { "reader": { "name": "Ada" } } }
  ]
}
```

Creation snapshots the template and begins enqueueing immediately. Before each recipient is enqueued, PaperBoy checks the organization-owned `email_suppressions` table and confirms the originating API key remains active. Suppressed addresses never create message rows and are counted separately; key revocation pauses the broadcast. Every queued message uses the normal semantic queue path, so Cloudflare Email Sending and SMTP receive the same rendered provider-neutral content. Broadcasts do not inject open pixels or click tracking.

Progress is available from `GET /api/v1/broadcasts` and `GET /api/v1/broadcasts/:broadcastId`. Use `POST` on `/pause`, `/resume`, or `/cancel` beneath that broadcast URL. Pause takes effect after an already-processing recipient; resume handles pending recipients; cancel irreversibly marks pending recipients cancelled so they cannot be claimed. Responses expose counts, never audience addresses or rendered bodies. REST timestamps are RFC 3339 UTC; the console renders them in the signed-in user's persisted IANA timezone.

## Sending domains

Add a domain in the console or through MCP to get exact ownership, SPF, and DKIM TXT records, plus starter DMARC guidance. PaperBoy checks DNS from the application host. Ownership, SPF, and an active DKIM selector must match before the domain becomes verified; a later failed check returns it to pending so live delivery cannot continue on stale state.

The default SPF value is `v=spf1 mx ~all`. Operators whose outbound host is not authorised by the domain's MX records must set `PAPERBOY_SPF_RECORD` to their exact policy before adding or checking domains. Publish only one SPF record at each owner name. The [DNS operator guide](docs/dns.md) gives exact direct-IP, Cloudflare Email Routing, Cloudflare Email Sending, and staged DMARC instructions; authenticated MCP clients can read the identical guide at `paperboy://docs/dns`.

Set `PAPERBOY_DKIM_ENCRYPTION_KEY` to a base64-encoded 32-byte random value before adding domains or managing DKIM. For example, generate it in the deployment secret store with `openssl rand -base64 32`; do not put the result in source control, command-line arguments, or logs. PaperBoy stores each RSA private key in PostgreSQL inside a context-bound AES-256-GCM envelope. Console, API, and MCP responses expose only selector/public DNS material.

Rotation is staged: PaperBoy keeps signing with the active selector while the replacement is pending. A DNS check activates the replacement only after its public key resolves, moves the old selector to retiring, and keeps both DNS instructions visible. Finalising rotation destroys the retiring encrypted private key. Stored lifecycle instants are UTC; console presentation uses the signed-in user's persisted IANA timezone.

### Cloudflare Email compatibility

Cloudflare DNS and [Email Routing](https://developers.cloudflare.com/email-service/configuration/domains/) can coexist with PaperBoy signing. PaperBoy selectors start with `pb` and do not collide with Cloudflare's `cf-bounce` or `cf2024-1` selectors. Keep both providers' DKIM TXT records. If Email Routing manages the root SPF record, merge PaperBoy's sending mechanism into a single record; for an MX-authorised PaperBoy MTA the value is `v=spf1 mx include:_spf.mx.cloudflare.net ~all`. Set that complete value in `PAPERBOY_SPF_RECORD`; never publish two `v=spf1` records.

[Cloudflare Email Sending](https://developers.cloudflare.com/email-service/reference/headers/) is different: Cloudflare controls `Date` and `DKIM-Signature` and signs with its provider-managed selector. PaperBoy's Cloudflare payload builder therefore uses structured messages rather than a pre-signed or pre-dated raw message and never decrypts a PaperBoy key. It maps stored files to Cloudflare's Base64 `attachments` objects and enforces Cloudflare's lower 5 MiB total-message limit before a provider request; PaperBoy's general attachment limit remains 10 MiB. The future Cloudflare provider adapter must use this boundary. SMTP/self-hosted MTA delivery uses PaperBoy's verified active key. This keeps both paths valid without double-signing or leaking private material.

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
        "PAPERBOY_DKIM_ENCRYPTION_KEY": "<injected base64-encoded 32-byte key>",
        "PAPERBOY_ATTACHMENT_STORAGE_PATH": "<private shared attachment path>"
      }
    }
  }
}
```

Inject secrets through the agent runtime's secret or environment facility. Do not put keys in tool arguments, URLs, command-line arguments, source control, or logs.

The contract exposes capability/account context plus first-class single/batch sending, template list/get/create/update/delete/preview, broadcast list/get/create/pause/resume/cancel, domain list/create/verify/delete, and DKIM setup/rotate/finalise tools. Authenticated resources cover configuration, operator safety, templates, broadcasts, and DNS. `paperboy_preview_template` renders sample JSON and lists missing required variables without queueing or sending mail. Broadcast tools expose aggregate progress without returning audience addresses or message bodies; cancellation requires explicit confirmation. `paperboy_send_email` accepts inline content or `template_id` plus `data`, as well as the same private Base64 attachments as HTTP, but never returns message or attachment content. `paperboy_send_email_batch` preserves input order, reports per-item failures, supports template-backed items, and rejects attachments. Every tool schema carries `paperboy/schemaVersion`. Tenant context comes from the key; callers cannot select another organization. Template, broadcast, domain, and DKIM mutations re-read the key creator's current membership and role; destructive cancellation/deletion/finalisation requires explicit confirmation. MCP protocol timestamps are RFC 3339 UTC and identify `UTC` explicitly. DKIM output contains public DNS material and lifecycle metadata only.

HTTP checks revocation on every request. Stdio checks at startup and before every tool call; after revocation, reconnect with a newly issued key. Tool schemas and non-tenant documentation may remain discoverable on an already-open stdio connection, but tenant operations fail immediately.

## What v1 does

Send transactional mail through an API that looks familiar if you have used Resend: API keys, domains, templates, events, webhooks. You run the MTA. PaperBoy does not sell you someone else's SMTP.

## What v1 does not do

- Not a marketing ESP with drag-and-drop campaigns as the core
- Not a closed hosted SaaS
- No third-party send vendor as the default path
