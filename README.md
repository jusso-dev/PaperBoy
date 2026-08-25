# PaperBoy

Self-hosted transactional email. A cheaper Resend you run on your own box.

![PaperBoy banner](docs/banner.jpg)

## Product tour

PaperBoy uses a postal-stationery interface across the whole console, from live
delivery reporting to provider operations. These screenshots were captured
from the running homelab deployment using synthetic demonstration data. Account
identity is redacted; no real recipients or credentials are shown.

<p align="center">
  <img src="docs/screenshots/overview-desktop.png" alt="PaperBoy overview with delivery metrics, activity chart, recent email, and sending-domain status" width="100%">
</p>

| Compose and delivery | Templates and audiences |
| --- | --- |
| <img src="docs/screenshots/send-email-desktop.png" alt="PaperBoy test email composer" width="100%"> | <img src="docs/screenshots/templates-desktop.png" alt="PaperBoy email template editor" width="100%"> |
| <img src="docs/screenshots/delivery-desktop.png" alt="PaperBoy delivery log" width="100%"> | <img src="docs/screenshots/audiences-desktop.png" alt="PaperBoy audience and contact management" width="100%"> |

| Audience hygiene | Scheduled broadcasts |
| --- | --- |
| <img src="docs/screenshots/audience-unsubscribe-cleanup-desktop.png" alt="PaperBoy bulk cleanup control for unsubscribed audience contacts while retaining organization suppressions" width="100%"> | <img src="docs/screenshots/broadcasts-desktop.png" alt="PaperBoy immediate and scheduled broadcast console with HTML preview controls" width="100%"> |

| Frozen broadcast preview | Suppression operations |
| --- | --- |
| <img src="docs/screenshots/broadcast-preview-desktop.png" alt="PaperBoy scheduled broadcast HTML preview rendered from the frozen template snapshot" width="100%"> | <img src="docs/screenshots/suppressions-desktop.png" alt="PaperBoy suppression list creation, CSV import, search, and reason filtering" width="100%"> |

| API access | Provider operations |
| --- | --- |
| <img src="docs/screenshots/api-keys-desktop.png" alt="PaperBoy API key management with masked credential identifiers" width="100%"> | <img src="docs/screenshots/organization-desktop.png" alt="PaperBoy organization, send-rate limit, and outbound-provider operations" width="100%"> |

<p align="center">
  <img src="docs/screenshots/settings-desktop.png" alt="PaperBoy account security, password change, MFA, passkeys, and fixed Australia Sydney timezone settings" width="100%">
</p>

| Mobile overview | Mobile navigation |
| --- | --- |
| <img src="docs/screenshots/overview-mobile.png" alt="PaperBoy mobile dashboard overview" width="390"> | <img src="docs/screenshots/navigation-mobile.png" alt="PaperBoy mobile postal navigation drawer" width="390"> |

## Stack (locked)

- Next.js 16.3 App Router
- Instant navigation (no full reloads on dashboard routes)
- Drizzle ORM + Postgres
- Bun 1.4 runtime, package manager, and test runner
- Redis + BullMQ for delayed, retrying, and concurrent jobs
- Better Auth
- First-class MCP server over the same domain services as HTTP and the console
- CI on GitHub's native Linux ARM64 runner with isolated PostgreSQL, Redis, and Mailpit service containers, the fixed `Australia/Sydney` application timezone, and read-only repository permissions. Fork pull requests are skipped; same-repository pull requests and `main` pushes run the full gate, while `main` also builds and publicly verifies the ARM64 GHCR image.

## Container image

After the full `main` CI gate passes, PaperBoy publishes a public ARM64 image as `ghcr.io/jusso-dev/paperboy:main`, `:latest`, and `:sha-<full commit SHA>`. Pulls require no registry credentials:

```sh
docker pull --platform linux/arm64 ghcr.io/jusso-dev/paperboy:main
docker run --rm --platform linux/arm64 --env-file /path/to/protected.env -p 3000:3000 ghcr.io/jusso-dev/paperboy:main
```

The image runs Next.js and the remote MCP server on Bun as a non-root user with `TZ=Australia/Sydney`, `PAPERBOY_DEFAULT_TIME_ZONE=Australia/Sydney`, and `PAPERBOY_FIXED_TIME_ZONE=Australia/Sydney`. Run BullMQ jobs from the same immutable image digest as a separately supervised process by overriding the command with `bun run jobs`; local MCP clients can use `bun run mcp:stdio`. The fixed policy applies to every account and presentation surface while stored instants and public protocol timestamps remain UTC.

## Security

PaperBoy's repository-scoped [threat model](docs/threat-model.md) covers Better Auth sessions, authenticator MFA, passkeys, REST and first-class MCP authentication, tenant boundaries, UTC/IANA timezone handling, DKIM and webhook key storage, self-hosted SMTP, Cloudflare Email Service, attachments, and GitHub-hosted ARM64 CI. Its limits are explicit: a leaked bearer key remains usable until revoked, an incorrectly configured MTA can become an open relay, and provider acceptance is not proof of final delivery.

Password sign-in supports TOTP MFA, single-use recovery codes, 30-day trusted devices, and a 15-minute account lock after five failed second-factor attempts. Passkeys are a phishing-resistant passwordless sign-in option and can be enrolled, named, listed, and deleted in Settings. Before enrolling passkeys in production, set `BETTER_AUTH_URL` and `PAPERBOY_PASSKEY_ORIGIN` to the exact external HTTPS origin and set `PAPERBOY_PASSKEY_RP_ID` to that host or a valid parent domain. A passkey sign-in is a standalone passwordless factor; it is not followed by the TOTP challenge used for password sign-in.

Run `bun run security:secrets` before pushing. CI scans full Git history with pinned, checksum-verified Gitleaks default rules plus explicit AWS-key, PaperBoy API-key, webhook-secret, service-key, SMTP-credential, and Cloudflare Email token patterns. Scanning runs locally; the repository is not uploaded to a security SaaS. A clean scan cannot find every runtime or novel secret, so rotate any exposed credential before cleaning source history.

## Theme

Paper watermark (newsprint, cream stock). Light blue accent `#7EB8DA`. Ink `#1A1A1A`. No neon, no dark SaaS chrome.

## Database

PaperBoy uses PostgreSQL through Drizzle ORM. Set `DATABASE_URL` to an operator-controlled PostgreSQL instance hosted in the approved Australian region, then apply the in-repo migrations:

```sh
bun run db:migrate
```

Generate a migration after changing `src/db/schema.ts` with `bun run db:generate`.

The production image includes the immutable `drizzle/` migration bundle and its
runtime dependencies, so the same `bun run db:migrate` command can run as a
one-off release task before the web and job containers are replaced.

All stored instants and public protocol timestamps are UTC. PaperBoy persists and enforces `Australia/Sydney` for every user-facing calendar, console, log, and scheduling surface; the Settings control is locked while `PAPERBOY_FIXED_TIME_ZONE` is set.

The matching SQL in `drizzle/down/` exists only to prove rollback on a throwaway database. Do not run it against a database containing PaperBoy data.

## API keys

The console mints `pb_live_` and `pb_test_` bearer keys. A key contains a public identifier and a 256-bit secret; PostgreSQL stores the identifier and SHA-256 hash, never the raw key. The raw value is shown once. Revocation is enforced by the shared HTTP/MCP authentication boundary on the next request.

## Organization rate limits

Every accepted message consumes one PostgreSQL rate-limit slot shared by all keys in its organization and environment. Defaults are `PAPERBOY_LIVE_RATE_LIMIT_PER_MINUTE=60` and the higher `PAPERBOY_TEST_RATE_LIMIT_PER_MINUTE=600`. Both must be whole numbers from 1 to 1,000,000 and the effective test cap must remain higher than live. Owners and admins can set or clear per-organization overrides in the Organization console, through `GET`/`PATCH /api/v1/rate-limits`, or with the first-class `paperboy_get_rate_limits` and `paperboy_update_rate_limits` MCP tools; members can read them.

Windows are fixed UTC minutes. The counter update and queue insert share one database transaction, so parallel web/MCP processes cannot exceed the cap. Validation failures, suppressed recipients, rolled-back attachment writes, and idempotent replays consume no slot. A rejected single send returns HTTP 429, `Retry-After`, and a `rate_limit_exceeded` body containing the environment, effective limit, and matching retry delay. Mixed batches preserve accepted neighbors with 207 and retry metadata; an entirely capped batch returns 429. A broadcast pauses with the unprocessed recipient still pending, ready to resume after reset.

The gate runs before provider queue insertion. Self-hosted SMTP and Cloudflare Email Sending therefore receive identical behavior, without Redis or a provider-specific counter. See the [rate-limit API, MCP, concurrency, timezone, and Cloudflare guide](docs/rate-limits.md).

## Open tracking

Open tracking is a persisted organization setting and is off by default. Current members can read it; owners and admins can change it in the Organization console, through `GET`/`PATCH /api/v1/open-tracking`, or with the first-class `paperboy_get_open_tracking` and `paperboy_update_open_tracking` MCP tools. Set `PAPERBOY_PUBLIC_URL` and a dedicated Base64-encoded 32-byte `PAPERBOY_OPEN_TRACKING_SIGNING_KEY` before enabling it.

When enabled, queue creation adds one signed first-party pixel to future HTML messages and snapshots that choice on the message. Plain-text messages remain untracked. The public pixel route always returns the same uncacheable transparent GIF; valid repeated requests create at most one `opened` event and invalid requests reveal no message state. The event contains no recipient, IP address, user agent, or provider payload. A fetch may come from a mail security scanner, privacy proxy, or prefetcher, so it does not prove a person read the message.

The pixel is part of provider-neutral stored HTML before delivery. Self-hosted SMTP and Cloudflare Email Service therefore receive the same signed URL and body while Cloudflare remains responsible for its provider-owned DKIM and ARC signatures. Events are stored and exposed in UTC; the console formats them in fixed `Australia/Sydney` time. Rotating the signing key invalidates outstanding pixels. See the [open-tracking privacy, API, MCP, timezone, and Cloudflare guide](docs/open-tracking.md).

## Console test send

The signed-in console at `/app/send` lets owners and admins compose one provider test from a verified domain. It enters the same live queue used by `POST /api/v1/emails` and `paperboy_send_email`, including domain/DKIM authorisation, suppressions, organization rate limits, delivery events, and logs. Members can inspect delivery records but cannot queue a console send. Success timestamps render in fixed `Australia/Sydney` time; stored and protocol timestamps remain UTC.

This is a real provider check rather than isolated test-sink traffic. A development job runner configured for Mailpit captures it, while a production job runner configured for Cloudflare Email Service submits it through the same live SMTP adapter. Use a safe recipient address.

## Message logs

The signed-in console at `/app/logs` lists the 50 most recent matching messages with status, sending-domain, and inclusive calendar-date filters. Calendar dates are interpreted in fixed `Australia/Sydney` time before indexed tenant-safe PostgreSQL queries receive UTC boundaries. Selecting a row opens its safe metadata and ordered event timeline in a drawer without a page reload; message HTML, plain text, attachment bytes, event data, and provider payloads are not rendered there.

Only organization owners can click **Download MIME (.eml)**. The file is an unsigned reconstruction from the stored semantic message and verified private attachment bytes, not a captured provider transmission. PaperBoy never stores Cloudflare's provider-owned DKIM or ARC headers, so those signatures are intentionally absent; Cloudflare Email Service remains the signing authority when it submits the live message. Admins and members can inspect logs and events but cannot download reconstructed MIME.

The first-class `paperboy_list_delivery_statuses` MCP tool accepts optional `status`, `domainId`, `createdAtFrom`, `createdAtBefore`, and `limit` filters. MCP date bounds are RFC 3339 instants and remain UTC; tenant and environment come only from the API key. `paperboy_get_delivery_status` and `paperboy_list_message_events` expose the same delivery state and safe timeline without recipients, bodies, event data, provider payloads, or MIME. REST message detail includes nullable `domain_id` and keeps all timestamps in UTC.

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

For local storage, set `PAPERBOY_ATTACHMENT_STORAGE_DRIVER=local` and `PAPERBOY_ATTACHMENT_STORAGE_PATH` to a dedicated absolute path on a private volume shared by web and jobs. PaperBoy creates generated blob keys with directory mode `0700` and file mode `0600`.

For production S3, set the driver to `s3` plus `PAPERBOY_ATTACHMENT_S3_BUCKET`, `PAPERBOY_ATTACHMENT_S3_REGION`, and optional `PAPERBOY_ATTACHMENT_S3_PREFIX` (default `attachments`). The AWS SDK uses the standard credential chain, including the EC2 instance role; do not inject static access keys. Writes are create-only, checksum-protected, private, and explicitly SSE-S3 encrypted. Keep all S3 Block Public Access controls enabled and grant only `GetObject`, `PutObject`, and `DeleteObject` on the configured prefix. PaperBoy never creates an attachment URL. PostgreSQL stores only attachment metadata, byte size, SHA-256 integrity hash, and the opaque storage key.

A live key can queue only from a verified domain in its organization with an active PaperBoy DKIM key. A test key always queues to the isolated `test-sink` mode and cannot become live delivery. Send idempotency is optional through either the `Idempotency-Key` header or JSON `idempotency_key` field; when both are present they must match exactly. Keys are scoped to the authenticated API key, limited to 256 visible ASCII characters, and active for 24 hours from the first accepted message using PostgreSQL UTC instants. During that window, repeating the same normalized request returns the original ID and a changed body returns 409. After expiry, reuse creates a new message. Replays insert no queue row, consume no rate-limit slot, and never resubmit to SMTP or Cloudflare Email Service. The first-class MCP `idempotencyKey` input uses the same 24-hour service.

Read one message with `GET /api/v1/emails/:id` and its ordered lifecycle with `GET /api/v1/emails/:id/events`. Both routes derive organization and `live`/`test` environment from the bearer key; cross-tenant and cross-environment IDs remain hidden as 404. Message detail returns semantic content and safe attachment metadata, never stored attachment bytes, hashes, or storage keys. Events use the bounded `queued`, `delivered`, `deferred`, `bounced`, `complained`, and `opened` catalog. `opened` is rejected unless that message persisted explicit tracking opt-in; the organization flag is off by default and valid repeat pixel requests deduplicate to one event.

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

Each item is validated and queued independently under the same API-key, domain, suppression, and organization rate-limit rules. Inline and template-backed items can be mixed in one batch. Mixed success returns HTTP 207 with each array position containing either `{id}` or a structured `{error}`; valid neighbors are not dropped. If rate limiting affects any item, `Retry-After` reports the window delay; an entirely capped batch returns 429. Invalid envelopes return 422. Batch idempotency is not available yet, so an `Idempotency-Key` fails explicitly instead of being ignored.

The queue stores semantic `from`, `to`, subject, HTML/text, tags, and private attachment references rather than prebuilt MIME. This leaves Date and DKIM ownership to the selected outbound adapter: a self-hosted SMTP path builds MIME with the stored bytes and can use PaperBoy signing, while Cloudflare Email Sending receives structured Base64 attachments and constructs and signs its provider-managed message without double-signing. This endpoint persists authoritative `queued` rows in PostgreSQL and dispatches exact BullMQ jobs through Redis; the job runner is a separate deployment component.

Message and event instants are PostgreSQL `timestamptz` values. REST and MCP expose them as RFC 3339 UTC; console presentation uses fixed `Australia/Sydney` time.

### OpenAPI, console docs, CLI, and TypeScript SDK

[`openapi.yaml`](openapi.yaml) is the linted OpenAPI 3.1 contract for emails, batch send, templates, audiences, broadcasts, suppressions, rate limits, outbound-provider selection and testing, organization open tracking, its public signed pixel, webhook configuration, and raw-body signature verification. It also records each private operation's first-class MCP equivalent. Validate it with `bun run openapi:lint`.

The signed-in console renders that contract at `/app/docs`. The same document is served at `/openapi.yaml`.

The Rust CLI in [`crates/paperboy`](crates/paperboy) calls the bearer-key routes. Build it with `cargo build --release -p paperboy` and see [CLI usage](docs/cli.md). Keep `PAPERBOY_API_KEY` in the process environment.

The handwritten [`@paperboy/sdk`](packages/sdk/README.md) exposes `send()` and `get(id)` over the same HTTP surface using platform `fetch` and no runtime dependencies. Build JavaScript and declarations with `bun run sdk:build`; generated `packages/sdk/dist` output is ignored and must not be committed. SDK, CLI, and MCP timestamps remain UTC, with explicit IANA timezones applied only by presentation clients. Self-hosted SMTP and Cloudflare Email Service consume the same provider-neutral queued message; Cloudflare remains responsible for its provider-owned DKIM/ARC signatures.

## BullMQ jobs

Run a supervised job process beside the web process after applying migrations:

```sh
bun run jobs
```

Both web and jobs require `REDIS_URL`. The job process also needs the same `DATABASE_URL`, attachment driver settings, provider variables, and `PAPERBOY_WEBHOOK_ENCRYPTION_KEY` as the web process. Redis is BullMQ's dispatch, delay, and concurrency plane; configure persistent storage and `maxmemory-policy=noeviction`. PostgreSQL remains the authoritative message, broadcast, webhook, lease, retry, and delivery state. A five-second reconciler restores Redis jobs from PostgreSQL after enqueue errors, Redis loss, or process restarts.

The production image defaults to the web process. Set `PAPERBOY_PROCESS_TYPE=jobs` on the separate jobs application; its entrypoint applies pending database migrations before starting BullMQ. Any other process value fails closed.

`PAPERBOY_MESSAGE_JOB_CONCURRENCY`, `PAPERBOY_BROADCAST_JOB_CONCURRENCY`, and `PAPERBOY_WEBHOOK_JOB_CONCURRENCY` default to 5, 1, and 5. `PAPERBOY_JOB_RECONCILE_MS` defaults to 5,000 and `PAPERBOY_JOB_RECONCILE_LIMIT` to 250. `PAPERBOY_QUEUE_PREFIX` defaults to `paperboy`; set a distinct prefix when multiple PaperBoy deployments share Redis. `PAPERBOY_JOB_WORKER_ID` may supply a stable process identity. Keep every process on fixed `Australia/Sydney`; queue instants, retries, and provider timestamps remain UTC.

Set `SMTP_URL` to provide the operator-default SMTP credential. PaperBoy accepts `smtp://` submission and `smtps://` implicit TLS URLs. `SMTP_TLS_MODE` defaults to `required`: an `smtp://` connection must upgrade with STARTTLS or fail safely. `opportunistic` permits a failed upgrade to continue and `disabled` sends plaintext, so use either weaker mode only on a trusted development network. `smtps://` always requires implicit TLS. Inject URL credentials through the deployment secret store; PaperBoy never writes the URL, credentials, or raw relay response to PostgreSQL, REST, console, MCP, delivery status, or logs.

Each organisation selects a default provider and may override individual sending domains. The choice is snapshotted on every queued message, so later changes cannot reroute existing mail. Missing credentials fail closed with a clear 422 before a new live row is inserted. If credentials disappear after queueing, the job runner fails that provider route explicitly instead of silently falling back to SMTP. See the [provider contract, secret naming, REST, console, MCP, and Cloudflare guide](docs/outbound-providers.md).

### Mailpit development MTA

The committed development Compose file runs the official Mailpit image with its UI and SMTP listener bound to host loopback:

```sh
docker compose -f compose.dev.yml up --wait redis mailpit
bun run jobs
```

The development values in `.env.example` point jobs at plaintext Mailpit on `127.0.0.1:1025` and Redis on `127.0.0.1:6379`; inspect captured messages at [http://127.0.0.1:8025](http://127.0.0.1:8025). Start both with `docker compose -f compose.dev.yml up --wait redis mailpit`. Stop this isolated service with `docker compose -f compose.dev.yml down`. Do not carry `SMTP_TLS_MODE=disabled` into production.

For a production Postfix, Haraka, or equivalent submission service, use its authenticated `smtp://...:587` endpoint and leave `SMTP_TLS_MODE` unset so STARTTLS is mandatory. An implicit-TLS relay uses `smtps://...:465`.

### Cloudflare Email Service

Cloudflare Email Service is a first-class selectable identity over the same hardened SMTP transport. After onboarding the sending domain and creating an Email Sending token, inject `CLOUDFLARE_EMAIL_SMTP_URL` as `smtps://api_token:<URL-encoded API token>@smtp.mx.cloudflare.net:465`, or retain a Cloudflare-hosted `SMTP_URL` for compatibility. Per-organisation Cloudflare and SMTP secrets use normalized UUID-suffixed names documented in the provider guide. Cloudflare requires the literal username `api_token`, port 465, and implicit TLS; its SMTP submissions enter the same delivery, DKIM/ARC-signing, limits, and log pipeline as its REST API and Workers binding. See Cloudflare's [SMTP reference](https://developers.cloudflare.com/email-service/api/send-emails/smtp/).

### Amazon SES

Amazon SES is a first-class regional SES v2 adapter. It accepts an operator default or per-organisation IAM role/access-key configuration, submits recipient-specific jobs as complete raw MIME with `SendEmail`, stores the returned SES message ID, and exposes `SendBulkEmail` through the provider contract for compatible groups of up to 50. A PostgreSQL-backed quota guard refreshes regional `GetAccount` quotas, reserves recipient capacity across every job process, uses 80% of the observed per-second rate and 90% of the rolling 24-hour allowance, and defers safely when capacity is unavailable without consuming the message retry budget. Connection tests combine `GetAccount` with paginated `ListEmailIdentities` discovery and surface only the region, sandbox/production access, sending-enabled state, and normalized domains whose SES verification is successful and sending is enabled. SES Easy DKIM owns signing on this path.

Configuration-set tags correlate delivery, delay, bounce, and complaint events. Signed SNS uses the per-organisation public callback; EventBridge, REST, and MCP use the authenticated tenant service. Events are idempotent and content-free. Permanent bounces and complaints update the same provider-neutral suppression list checked before future sends. See the [SES credentials, event endpoints, console, REST, MCP, and DNS guide](docs/outbound-providers.md).

PaperBoy still keeps a provider-neutral semantic queue. SMTP builds raw MIME only inside the SMTP adapter. The separate Cloudflare structured-payload builder remains available for a REST or Workers adapter and deliberately omits PaperBoy-owned Date and DKIM headers. Both paths consume the same validated bodies, signed first-party open pixels when the organization opted in, and attachment bytes, so enabling SMTP does not turn the queue or MCP surface into an SMTP-only contract.

BullMQ schedules exact message, broadcast, webhook, and reconciliation jobs in Redis. Each job re-checks authoritative PostgreSQL state before acting. A message job claims one due `queued` message with `FOR UPDATE SKIP LOCKED`, changes it to `sending`, and holds a five-minute lease. `sent` and `failed` are terminal. If a process exits mid-send, PostgreSQL retains the row and reconciliation makes it claimable after lease expiry. Delivery remains at least once: a crash after an external provider accepts a message but before PaperBoy commits `sent` can cause a duplicate, so adapters should use provider idempotency where available.

Transient network failures, HTTP 5xx, and SMTP 4xx return to `queued` after 1 minute, 5 minutes, 30 minutes, then 2 hours. Five failed attempts exhaust the retry budget. SMTP 550 and other permanent errors move directly to `failed`. Sanitized error codes and reasons are stored for the console and MCP; message content, recipient addresses, attachments, credentials, and raw provider responses are not returned by those status surfaces.

The job runner routes test keys only to the isolated test sink and routes live messages by their persisted provider identity. The shared contract supports send, optional batch and scheduling operations, connection tests, provider receipts, and event mapping. SMTP, explicit Cloudflare, and Amazon SES identities are live now; Azure fails explicitly until its dedicated adapter lands. Delivery passes one provider-neutral semantic message including verified attachment bytes. SMTP and SES build MIME from that value, while the Cloudflare compatibility assertion also converts that exact value into Cloudflare Email Sending's structured, unsigned REST payload.

Queue creation stores its `queued` event in the same transaction as the message. A successful job transition stores `sent` state and its initial `delivered` event atomically, so self-hosted SMTP, Cloudflare Email Service SMTP, and SES share one event contract. SES configuration-set feedback then adds idempotent `delivered`, `deferred`, `bounced`, or `complained` provider outcomes. Equal event instants use an internal sequence tie-break; REST and MCP timelines remain stable without exposing that sequence.

### Bounce and complaint feedback

PaperBoy ingests bounded RFC 3464 DSNs and RFC 5965 ARFs through `bun run feedback:ingest` or the first-class `paperboy_ingest_feedback` MCP tool. Permanent `5.x.x` bounces and complaints add organization suppressions; transient `4.x.x` bounces do not. Future single, batch, broadcast, HTTP, and MCP sends reject suppressed recipients with `recipient_suppressed` before queue insertion. Raw reports are never stored, exact replays are idempotent, events and signed webhooks contain no recipient or report content, and every timestamp remains UTC.

For self-hosted SMTP, set `PAPERBOY_BOUNCE_ADDRESS` and route that address to the protected Postfix stdin hook. PaperBoy adds a stable correlation header and requests failure/delay DSNs. Cloudflare Email Sending instead owns its `cf-bounce` return path and provider suppression pipeline; do not replace it. Cloudflare SMTP delivery still emits through the same PaperBoy event/webhook path. See the exact [Postfix and Cloudflare feedback guide](docs/feedback.md).

### Suppression list

The console, REST API, and first-class MCP tools manage the same organization suppression list. Owners and admins can create, update, remove, and atomically import UTF-8 CSV records; members can read them. Search and reason filters expose manual, unsubscribed, permanent-bounce, and complaint entries with console timestamps in fixed `Australia/Sydney` time and protocol timestamps in UTC.

REST provides `GET`/`POST /api/v1/suppressions`, `GET`/`PATCH`/`DELETE /api/v1/suppressions/:suppressionId`, and `POST /api/v1/suppressions/import` with `Content-Type: text/csv`. CSV is bounded to 1 MiB and 5,000 rows, validates fully before mutation, and keeps the strongest reason across duplicates. The matching MCP tools expose the same CRUD/import services without accepting an organization ID.

Suppression checks happen before queue insertion, so blocked recipients never reach SMTP, Cloudflare Email Sending, or a future adapter. PaperBoy's list complements Cloudflare's independent `cf-bounce` and provider suppression controls; removing a PaperBoy record does not bypass a Cloudflare provider suppression. See [suppression API, CSV, MCP, and Cloudflare behavior](docs/suppressions.md).

## Signed webhooks

Owners and admins can configure one organization-wide endpoint with `PUT /api/v1/webhooks` or `paperboy_configure_webhook`:

```sh
curl -X PUT https://paperboy.example/api/v1/webhooks \
  -H 'Authorization: Bearer <PaperBoy API key>' \
  -H 'Content-Type: application/json' \
  --data '{"url":"https://hooks.example.com/paperboy"}'
```

First creation returns a generated `whsec_...` `signing_secret`. Store it immediately in the receiver's secret manager: PaperBoy keeps only a context-bound AES-256-GCM envelope and `GET /api/v1/webhooks` never returns either raw or encrypted secret. Reconfiguring the URL preserves the existing secret and returns `signing_secret: null`. Set the same `PAPERBOY_WEBHOOK_ENCRYPTION_KEY` to a dedicated Base64-encoded 32-byte key in every web, MCP, and job process; do not reuse the DKIM key. Without it, webhook delivery jobs remain queued.

Each event POST carries `webhook-id`, `webhook-timestamp`, and `webhook-signature`. The signature is `v1,<Base64 HMAC-SHA256>` over the exact raw UTF-8 string `<id>.<Unix-seconds timestamp>.<body>`, keyed by the Base64-decoded portion after `whsec_`. Verify the raw body before JSON parsing, compare in constant time, and reject timestamps outside a five-minute tolerance. The format follows Svix's [white-labelled signing contract and manual verification algorithm](https://docs.svix.com/receiving/verifying-payloads/how-manual).

The stable event ID remains unchanged across retries; attempt timestamp and signature change. Any 2xx response completes delivery. Network failures and 5xx responses retry after 1 minute, 5 minutes, 30 minutes, then 2 hours; 3xx and 4xx responses fail without retry, and five attempts exhaust the queue. PostgreSQL leases make abandoned attempts reclaimable, with the same at-least-once caveat as email delivery.

Bodies contain only `type`, UTC `created_at`, and `data.email_id` plus `data.environment`; recipients, subject, message content, attachments, credentials, and provider payloads stay out. SMTP, Cloudflare Email Service, and future adapters emit through the same transactionally queued event path. Production configuration accepts HTTPS only. Plain HTTP is restricted to `localhost`/loopback receivers outside production for local validation.

## Email templates

Templates are organization-owned records with a case-insensitively unique name, subject, at least one of HTML or plain text, and an explicit `required_variables` list. Owners and admins manage them in the console; members can read and preview them. The console formats template timestamps in fixed `Australia/Sydney` time. REST timestamps and MCP timestamps are RFC 3339 UTC.

The bearer-key REST surface is:

- `GET /api/v1/templates` and `POST /api/v1/templates`
- `GET`, `PATCH`, and `DELETE /api/v1/templates/:templateId`
- `POST /api/v1/templates/:templateId/preview` with `{ "data": { ... } }`

REST tenant context always comes from the key. Template CRUD also re-checks the key creator's current organization membership and role. A missing or cross-organization template returns 404; duplicate names return 409. API responses never accept a caller-supplied organization ID.

Template variables use dotted double braces such as `{{reader.name}}`. PaperBoy deliberately supports no helpers, sections, expressions, triple braces, or executable template code. Data must be a bounded JSON object containing nested objects and scalar values; arrays and prototype-sensitive keys are rejected. HTML substitutions are escaped, while subject and plain-text substitutions remain text. Missing optional variables render as empty text. Missing required variables are listed by preview and return `missing_template_variables` with field-level details from send; they never silently queue a partial message.

The dedicated console preview route opens with generated sample JSON and renders without a full document navigation. It never queues or sends mail. HTML preview runs in a sandboxed iframe with scripts, form submission, top-level navigation, and credentialed same-origin access blocked. Authored HTTP(S), blob, and data images load with referrers suppressed. Rendered subject, plain text, source, and every missing required path remain visible outside the frame.

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

### Audiences, contacts, and broadcasts

Audiences are organization-owned collections of permission-based contacts without an application-level audience or contact-count cap. Owners and admins manage them; members can read them. REST provides:

- `GET`/`POST /api/v1/audiences`
- `GET`/`PATCH`/`DELETE /api/v1/audiences/:audienceId`
- `GET`/`POST /api/v1/audiences/:audienceId/contacts`
- `GET`/`PATCH`/`DELETE /api/v1/audiences/:audienceId/contacts/:contactId`
- `POST /api/v1/audiences/:audienceId/contacts/import` with `Content-Type: text/csv`

Each contact stores normalized `email`, optional `name`, and UTC `unsubscribed_at`. CSV accepts UTF-8 with an `email` header and optional `name`, at most 1 MiB per request and without a row-count cap. Repeated imports can grow an audience without a PaperBoy contact-count cap. The complete file validates before mutation, duplicate rows resolve deterministically, and replays report unchanged contacts. Import only recipients who gave permission; PaperBoy has no purchased-list marketplace.

`POST /api/v1/broadcasts` sends one stored template now to a snapshot of one audience's active contacts:

```json
{
  "name": "Morning edition",
  "from": "Newsroom <news@example.com>",
  "template_id": "00000000-0000-4000-8000-000000000000",
  "audience_id": "00000000-0000-4000-8000-000000000001"
}
```

Creation snapshots the template and active contacts, then begins enqueueing immediately. Template data exposes `name`, `email`, `contact.name`, `contact.email`, and `unsubscribe_url`. PaperBoy appends an unsubscribe footer to every available body format when the stored template omitted that variable. Before each recipient is enqueued, PaperBoy checks `unsubscribed_at`, the organization-owned `email_suppressions` table, the shared organization rate limit, and whether the originating API key remains active. Suppressed addresses never create message rows and are counted separately; key revocation or a reached rate limit pauses the broadcast without failing the pending recipient. Broadcasts use the same organization open-tracking flag and provider-neutral queue as single and batch sends. When opted in, HTML recipients receive one signed pixel; click tracking is not implemented.

Set `PAPERBOY_PUBLIC_URL` to the stable externally reachable origin and `PAPERBOY_UNSUBSCRIBE_SIGNING_KEY` to a dedicated Base64-encoded 32-byte key in every web and MCP process that can create broadcasts. Opening `/unsubscribe?token=...` is read-only so mail scanners cannot opt a contact out. Explicit confirmation verifies the HMAC-SHA256 PaperBoy token, sets `unsubscribed_at` for that address across the organization's audiences, and creates an `unsubscribed` suppression in one transaction. Tokens intentionally remain valid for old mail; rotating the signing key invalidates outstanding links.

The signed URL and rendered footer are part of the provider-neutral semantic body before queue insertion. SMTP and Cloudflare Email Sending therefore receive the same unsubscribe behavior; PaperBoy does not replace or bypass Cloudflare's independent `cf-bounce` and provider suppression pipeline. See [audience, CSV, unsubscribe, MCP, timezone, and Cloudflare behavior](docs/audiences.md).

Progress is available from uncapped `GET /api/v1/broadcasts` and `GET /api/v1/broadcasts/:broadcastId`. `PATCH /api/v1/broadcasts/:broadcastId` updates a still-scheduled broadcast; changing its audience or template atomically replaces the corresponding frozen snapshot, and changing `scheduled_for` reschedules its deterministic BullMQ job. Use `POST` on `/pause`, `/resume`, or `/cancel` beneath that broadcast URL. Pause takes effect after an already-processing recipient; resume handles pending recipients; cancel irreversibly marks pending recipients cancelled so they cannot be claimed. Responses expose counts and the source audience ID, never contact addresses or rendered bodies. REST timestamps are RFC 3339 UTC; the console renders them in fixed `Australia/Sydney` time.

## Sending domains

Add a domain in the console or through MCP to get exact ownership, SPF, and DKIM TXT records, plus starter DMARC guidance. Every console record has an explicit copy control that writes the complete TXT value without trimming or normalization and reports clipboard failure without hiding the selectable value. PaperBoy checks DNS from the application host. Ownership, SPF, and an active DKIM selector must match before the domain becomes verified; a later failed check returns it to pending so live delivery cannot continue on stale state.

The default SPF value is `v=spf1 mx ~all`. Operators whose outbound host is not authorised by the domain's MX records must set `PAPERBOY_SPF_RECORD` to their exact policy before adding or checking domains. Publish only one SPF record at each owner name. The [DNS operator guide](docs/dns.md) gives exact direct-IP, Cloudflare Email Routing, Cloudflare Email Sending, and staged DMARC instructions; authenticated MCP clients can read the identical guide at `paperboy://docs/dns`.

Set `PAPERBOY_DKIM_ENCRYPTION_KEY` to a base64-encoded 32-byte random value before adding domains or managing DKIM. For example, generate it in the deployment secret store with `openssl rand -base64 32`; do not put the result in source control, command-line arguments, or logs. PaperBoy stores each RSA private key in PostgreSQL inside a context-bound AES-256-GCM envelope. Console, API, and MCP responses expose only selector/public DNS material.

Rotation is staged: PaperBoy keeps signing with the active selector while the replacement is pending. A DNS check activates the replacement only after its public key resolves, moves the old selector to retiring, and keeps both DNS instructions visible. Finalising rotation destroys the retiring encrypted private key. Stored lifecycle instants are UTC; console presentation uses fixed `Australia/Sydney` time.

### Cloudflare Email compatibility

Cloudflare DNS and [Email Routing](https://developers.cloudflare.com/email-service/configuration/domains/) can coexist with PaperBoy signing. PaperBoy selectors start with `pb` and do not collide with Cloudflare's `cf-bounce` or `cf2024-1` selectors. Keep both providers' DKIM TXT records. If Email Routing manages the root SPF record, merge PaperBoy's sending mechanism into a single record; for an MX-authorised PaperBoy MTA the value is `v=spf1 mx include:_spf.mx.cloudflare.net ~all`. Set that complete value in `PAPERBOY_SPF_RECORD`; never publish two `v=spf1` records.

[Cloudflare Email Sending](https://developers.cloudflare.com/email-service/reference/headers/) supports two compatible PaperBoy boundaries. Its REST API uses structured messages, so PaperBoy's Cloudflare payload builder omits prebuilt Date and DKIM headers, maps verified stored files to Base64 `attachments`, and enforces Cloudflare's lower 5 MiB total-message limit before a provider request. Its authenticated SMTP endpoint accepts the SMTP adapter's raw MIME over implicit TLS and then applies Cloudflare-managed DKIM/ARC signing. A self-hosted MTA remains responsible for signing its own SMTP submissions. PaperBoy never sends its encrypted private key to Cloudflare. This keeps every path valid without double-signing or leaking private material.

Shared delivery policy blocks live keys unless the normalized From domain is verified in that key's organization. Test keys always resolve to the isolated test sink and never bypass into live delivery.

## MCP server

PaperBoy exposes the same organization-safe application services to agents through two MCP transports:

- Streamable HTTP at `https://<paperboy-host>/api/mcp`
- stdio with `bun run mcp:stdio`

Streamable HTTP clients must send `Authorization: Bearer <PaperBoy API key>`. Local stdio clients provide `DATABASE_URL` and `PAPERBOY_API_KEY` through the child process environment:

```json
{
  "mcpServers": {
    "paperboy": {
      "command": "bun",
      "args": ["--cwd", "/absolute/path/to/PaperBoy", "run", "mcp:stdio"],
      "env": {
        "DATABASE_URL": "<injected database URL>",
        "PAPERBOY_API_KEY": "<injected PaperBoy API key>",
        "PAPERBOY_LIVE_RATE_LIMIT_PER_MINUTE": "60",
        "PAPERBOY_TEST_RATE_LIMIT_PER_MINUTE": "600",
        "PAPERBOY_DKIM_ENCRYPTION_KEY": "<injected base64-encoded 32-byte key>",
        "PAPERBOY_WEBHOOK_ENCRYPTION_KEY": "<injected different base64-encoded 32-byte key>",
        "PAPERBOY_UNSUBSCRIBE_SIGNING_KEY": "<injected dedicated base64-encoded 32-byte key>",
        "PAPERBOY_PUBLIC_URL": "https://paperboy.example",
        "PAPERBOY_ATTACHMENT_STORAGE_DRIVER": "s3",
        "PAPERBOY_ATTACHMENT_S3_BUCKET": "<private bucket>",
        "PAPERBOY_ATTACHMENT_S3_REGION": "ap-southeast-2"
      }
    }
  }
}
```

Inject secrets through the agent runtime's secret or environment facility. Do not put keys in tool arguments, URLs, command-line arguments, source control, or logs.

The contract exposes capability/account context plus first-class rate-limit settings, audience/contact CRUD and CSV import, single/batch sending, delivery-status list/get, ordered message-event timelines, signed webhook get/configure, template list/get/create/update/delete/preview, broadcast list/get/create/update/pause/resume/cancel, domain list/create/verify/delete, and DKIM setup/rotate/finalise tools. Authenticated resources cover configuration, operator safety, rate limits, audiences, BullMQ job operation, signed webhook verification, templates, broadcasts, suppressions, and DNS. Rate-limit and audience/contact tools never accept an organization ID; destructive deletions require explicit confirmation. `paperboy_list_delivery_statuses` and `paperboy_get_delivery_status` expose attempts, state times, and sanitized failures without recipients or message content. `paperboy_list_message_events` exposes the ordered lifecycle without recipients, content, event data, provider payloads, or the internal sequence. `paperboy_get_webhook` omits all secret material; `paperboy_configure_webhook` returns a signing secret only when first creating the endpoint. `paperboy_preview_template` renders sample JSON and lists missing required variables without queueing or sending mail. Broadcast tools accept an audience ID without a PaperBoy recipient-count cap, list every organization broadcast, and expose aggregate progress without returning contact addresses or message bodies; cancellation requires explicit confirmation. `paperboy_send_email` accepts inline content or `template_id` plus `data`, as well as the same private Base64 attachments as HTTP, but never returns message or attachment content. `paperboy_send_email_batch` preserves input order, reports per-item failures, supports template-backed items, and rejects attachments. Every tool schema carries `paperboy/schemaVersion`. Tenant context comes from the key; callers cannot select another organization. Rate-limit, template, audience, contact, broadcast, delivery, webhook, domain, and DKIM reads or mutations re-read the key creator's current membership and role. MCP protocol timestamps are RFC 3339 UTC and identify `UTC` explicitly. DKIM output contains public DNS material and lifecycle metadata only.

HTTP checks revocation on every request. Stdio checks at startup and before every tool call; after revocation, reconnect with a newly issued key. Tool schemas and non-tenant documentation may remain discoverable on an already-open stdio connection, but tenant operations fail immediately.

## What v1 does

Send transactional mail through an API that looks familiar if you have used Resend: API keys, domains, templates, events, webhooks. You run the MTA. PaperBoy does not sell you someone else's SMTP.

## What v1 does not do

- Not a marketing ESP with drag-and-drop campaigns as the core
- Not a closed hosted SaaS
- No third-party send vendor as the default path
