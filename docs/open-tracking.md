# Open tracking

PaperBoy open tracking is privacy-first, organization-scoped, and off by default. It is available through the Organization console, `GET`/`PATCH /api/v1/open-tracking`, and the first-class `paperboy_get_open_tracking` and `paperboy_update_open_tracking` MCP tools. Tenant context always comes from the authenticated session or API key. Members can read the setting; owners and admins can change it.

## Operator configuration

Set the stable public origin and a dedicated signing key in every web or MCP process that can queue messages:

```dotenv
PAPERBOY_PUBLIC_URL=https://paperboy.example
PAPERBOY_OPEN_TRACKING_SIGNING_KEY=<Base64-encoded 32-byte key>
```

Do not reuse the unsubscribe, webhook, DKIM, Better Auth, SMTP, or Cloudflare secret. The public origin must use HTTPS; plain HTTP is accepted only for loopback development outside production. Enabling fails safely when either value is missing or invalid. Rotation invalidates pixels in already-sent messages. Keep processes on `TZ=Australia/Sydney` with the fixed PaperBoy timezone policy; stored and protocol instants remain UTC.

## Message and event behavior

When the flag is on, PaperBoy generates the message UUID before insertion, signs a context-bound URL for that UUID, and adds one invisible first-party image before the closing HTML body tag. Plain-text messages are never tracked. Each queue row stores its effective choice, so disabling later does not change already-queued mail and enabling later does not retrofit older messages.

The public `/o/:messageId/:signature.gif` route always returns the same uncacheable one-pixel GIF with no cookie. Invalid signatures, unknown IDs, disabled messages, and valid messages are indistinguishable to the caller. A valid fetch records `{}` as the event data. A message-row lock plus a partial unique PostgreSQL index ensures two or more GETs create at most one `opened` event and at most one corresponding webhook delivery.

An event means only that an image URL was fetched. Security scanners, privacy proxies, and client prefetchers can trigger it before a person sees the message. Image blocking can prevent it after a person reads. Do not describe the signal as proof of a human read.

## SMTP and Cloudflare Email Service

Instrumentation happens in the shared queue before provider selection. Self-hosted SMTP builds MIME from the stored tracked HTML. Cloudflare Email Service SMTP receives that same HTML through `smtps://api_token:<URL-encoded token>@smtp.mx.cloudflare.net:465`; the structured Cloudflare builder also preserves it unchanged. PaperBoy adds no provider-owned `Date`, DKIM, or ARC header, so Cloudflare remains the signing authority.

The pixel callback returns to the configured PaperBoy public origin, not Cloudflare and not a third-party analytics service. The event stores a PostgreSQL UTC instant. REST and MCP serialize RFC 3339 UTC; console views format it in fixed `Australia/Sydney` time.
