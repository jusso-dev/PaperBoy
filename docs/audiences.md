# Audiences, contacts, and unsubscribe links

PaperBoy stores organization-owned audiences containing up to 100 contacts. A contact has a normalized email address, an optional name, and an `unsubscribed_at` instant. Owners and admins manage the records; current members can read them. Tenant context comes only from the signed-in session or bearer key.

PaperBoy supports permission-based lists. The console and documentation do not offer list purchasing, enrichment, scraping, or a contact marketplace. Operators are responsible for importing recipients who gave the sender permission.

## REST and CSV

- `GET` and `POST /api/v1/audiences`
- `GET`, `PATCH`, and `DELETE /api/v1/audiences/:audienceId`
- `GET` and `POST /api/v1/audiences/:audienceId/contacts`
- `GET`, `PATCH`, and `DELETE /api/v1/audiences/:audienceId/contacts/:contactId`
- `POST /api/v1/audiences/:audienceId/contacts/import` with `Content-Type: text/csv`

Cross-organization IDs remain hidden as 404. Audience names are case-insensitively unique per organization. Contact addresses are unique inside an audience. Deleting an audience cascades to its contacts and requires explicit console/MCP confirmation.

CSV must be valid UTF-8, at most 1 MiB, and contain at most 100 non-empty data rows. The first column is `email`; an optional second column is `name`.

```csv
email,name
ada@example.net,Ada Lovelace
grace@example.net,Grace Hopper
```

Quoted fields, commas inside quoted names, CRLF, LF, and a UTF-8 BOM are accepted. Unsupported columns, malformed quoting, invalid addresses, or overlong names reject the whole file before mutation. Duplicate rows use the last normalized occurrence. Existing names update only when changed; replaying identical CSV is idempotent and reports unchanged rows. Import cannot clear `unsubscribed_at`.

## Broadcast snapshots

Broadcast creation accepts `audience_id`, not caller-supplied recipient records. PaperBoy checks that the audience belongs to the API key's organization, snapshots only contacts whose `unsubscribed_at` is null, and preserves contact IDs privately on the snapshot. A missing, empty, cross-tenant, or over-limit audience fails before any message is queued.

Each recipient receives these template variables:

- `name` and `email`
- `contact.name` and `contact.email`
- `unsubscribe_url`

If an available HTML or text body does not reference `unsubscribe_url`, PaperBoy appends a simple footer. The rendered link is stored in the same provider-neutral semantic message as the rest of the body. Suppressions are checked again immediately before each queue insertion.

## Signed unsubscribe flow

Set a stable externally reachable `PAPERBOY_PUBLIC_URL` and a dedicated Base64-encoded 32-byte `PAPERBOY_UNSUBSCRIBE_SIGNING_KEY` in every web and MCP process that can create broadcasts. Do not reuse the Better Auth, DKIM, webhook, API, SMTP, or Cloudflare secret.

Tokens contain a version and contact UUID protected by HMAC-SHA256. They intentionally have no expiry so recipients can opt out from old email. Rotating the signing key invalidates every outstanding link, so rotate only as a deliberate security response or with an overlap/migration plan.

Opening `/unsubscribe?token=...` verifies enough to show a confirmation page but performs no mutation. This prevents link scanners from silently opting recipients out. Confirmation verifies the token again, locks the contact, sets `unsubscribed_at` for the same address across all audiences in that organization, and upserts an organization-wide `unsubscribed` suppression in one PostgreSQL transaction. Replays are safe. A modified payload or signature does not touch the database.

The suppression gate stops future transactional, batch, broadcast, REST, MCP, SMTP, and Cloudflare-bound queue insertion. A stronger permanent-bounce or complaint reason is not downgraded by unsubscribe.

## MCP and timezones

The first-class MCP tools are:

- `paperboy_list_audiences`, `paperboy_get_audience`, `paperboy_create_audience`, `paperboy_update_audience`, `paperboy_delete_audience`
- `paperboy_list_contacts`, `paperboy_get_contact`, `paperboy_create_contact`, `paperboy_update_contact`, `paperboy_delete_contact`, `paperboy_import_contacts`

No tool accepts an organization ID. Reads require current membership; mutations re-check that the API key creator is an owner or admin. Destructive tools require `confirm: true`. The authenticated `paperboy://docs/audiences` resource carries this operating contract.

PostgreSQL stores every instant as `timestamptz`. REST and MCP return RFC 3339 UTC and MCP identifies `protocolTimeZone: UTC`. The console formats contact, audience, and unsubscribe instants in fixed `Australia/Sydney` time. Unauthenticated confirmation copy does not invent another local timezone.

## Cloudflare Email Service

Unsubscribe generation happens before provider selection. SMTP and Cloudflare Email Sending receive the same rendered HTML/text and signed PaperBoy URL. The Cloudflare structured payload remains unsigned and omits PaperBoy-owned Date or DKIM headers; Cloudflare applies its own DKIM/ARC policy after submission.

Cloudflare separately owns its `cf-bounce` return path, bounce analytics, and provider suppression pipeline. PaperBoy never replaces, deletes, or bypasses those controls. PaperBoy's contact and suppression state complements Cloudflare by blocking locally before a provider request.
