# Suppression list

PaperBoy keeps one suppression list per organization. Reasons are `manual`, `unsubscribed`, `bounced`, and `complained`. The same table is checked by single sends, idempotent replays, batches, broadcasts, HTTP, and MCP before a queue row is inserted. The gate is provider-neutral, so a suppressed address never reaches either the SMTP adapter or Cloudflare Email Sending.

Owners and admins can create, update, delete, and import suppressions. Current organization members can read them. Tenant context always comes from the signed-in session or bearer key; callers never supply an organization ID.

## REST API

- `GET /api/v1/suppressions?query=example.net&reason=bounced&limit=100`
- `POST /api/v1/suppressions` with `{"email":"reader@example.net","reason":"manual"}`
- `GET /api/v1/suppressions/:suppressionId`
- `PATCH /api/v1/suppressions/:suppressionId` with `email`, `reason`, or both
- `DELETE /api/v1/suppressions/:suppressionId`
- `POST /api/v1/suppressions/import` with a `Content-Type: text/csv` body

Cross-organization IDs remain hidden as 404. Duplicate addresses return 409. Removing an entry allows future PaperBoy sends, so the console and `paperboy_delete_suppression` require explicit confirmation.

## CSV import

CSV must be UTF-8, no larger than 1 MiB, and contain at most 5,000 non-empty data rows. The first column is `email`; the optional second column is `reason`. Omitted reasons default to `manual`.

```csv
email,reason
former-reader@example.net,manual
opted-out@example.net,unsubscribed
hard-bounce@example.net,bounced
complaint@example.net,complained
```

Quoted RFC-style fields, CRLF, LF, and a UTF-8 BOM are accepted. Unsupported columns, malformed quoting, invalid addresses, and unknown reasons reject the whole import before mutation. Duplicate CSV rows and existing records preserve the strongest reason: `complained`, then `bounced`, then `unsubscribed`, then `manual`. Replaying the same import is safe and reports unchanged rows.

## MCP and timezones

The first-class MCP surface provides `paperboy_list_suppressions`, `paperboy_get_suppression`, `paperboy_create_suppression`, `paperboy_update_suppression`, `paperboy_delete_suppression`, and `paperboy_import_suppressions`. All use the organization bound to the authenticated API key and share the REST/console service layer.

Stored instants and REST/MCP timestamps are RFC 3339 UTC. The console formats them with the signed-in user's persisted IANA timezone.

## Cloudflare Email Service

PaperBoy suppressions run before provider selection, so they protect Cloudflare SMTP and future Cloudflare REST/Workers adapters without changing the provider-neutral queue. Cloudflare also maintains its own `cf-bounce` return path and provider suppression pipeline. These controls complement each other: deleting a PaperBoy entry does not delete or bypass a Cloudflare provider suppression, and PaperBoy does not replace Cloudflare bounce analytics.
