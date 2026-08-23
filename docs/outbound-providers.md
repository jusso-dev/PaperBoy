# Outbound providers

PaperBoy keeps the public `POST /api/v1/emails` payload Resend-shaped while making delivery routing an organisation setting. SMTP, Cloudflare Email Service, Amazon SES, and Azure Communication Services Email are stable provider identities behind one contract. Test API keys always use the isolated `test-sink` identity.

## Routing and queue snapshots

Each organisation has one default live provider. A sending domain may inherit it or override it. PaperBoy resolves the effective provider only after validating the live key, tenant-owned verified domain, active DKIM state, suppressions, and provider readiness. The resolved provider is stored on the message in the same queue transaction.

Changing a default or domain override affects future messages only. Existing queued messages retain their provider, PaperBoy message ID, event names, retry state, and webhook contract. PaperBoy never silently falls back to SMTP when another provider is unavailable.

The provider contract includes:

- one-message send and an optional batch method;
- an optional scheduling method, advertised only when the adapter implements it;
- provider connection testing;
- provider-event mapping into PaperBoy `delivered`, `bounced`, and `complained` events;
- a safe provider message-ID receipt for private correlation.

Amazon SES and Azure are selectable contract identities in this change. Their network send and event-ingestion implementations remain on their dedicated cards. Selecting either before its adapter exists returns an explicit `provider_adapter_unavailable` 422 response.

## Secrets and readiness

Provider selection is stored in PostgreSQL. Credentials are not. The web, MCP, and worker processes resolve credentials only from operator-injected environment secrets. REST, console, MCP, delivery status, and logs expose readiness and credential scope (`organization` or `operator-default`), never a value or secret reference.

`SMTP_URL` remains the operator-default SMTP credential. A per-organisation SMTP secret overrides it with:

```text
PAPERBOY_SMTP_URL_<NORMALIZED_ORGANIZATION_UUID>
```

Normalize the UUID by replacing dashes with underscores and uppercasing it. Optional per-organisation SMTP controls use the same suffix:

```text
PAPERBOY_SMTP_TLS_MODE_<NORMALIZED_ORGANIZATION_UUID>
PAPERBOY_BOUNCE_ADDRESS_<NORMALIZED_ORGANIZATION_UUID>
```

Missing or malformed credentials fail before queue insertion with a clear 422. They do not consume a rate-limit slot. Removing credentials after queueing causes the worker to fail the already-snapshotted message explicitly; it does not reroute it.

## Cloudflare Email Service

Cloudflare Email Service is a first-class selectable provider over the hardened SMTP transport. Set its operator-default secret separately:

```text
CLOUDFLARE_EMAIL_SMTP_URL=smtps://api_token:<URL-encoded-token>@smtp.mx.cloudflare.net:465
```

The per-organisation form is:

```text
PAPERBOY_CLOUDFLARE_EMAIL_SMTP_URL_<NORMALIZED_ORGANIZATION_UUID>
```

For compatibility, an `SMTP_URL` whose exact host is `smtp.mx.cloudflare.net` also satisfies Cloudflare readiness. Explicit Cloudflare selection enforces the literal `api_token` username, implicit TLS, port 465, and the provider host. PaperBoy does not apply its self-hosted bounce address to that route. Cloudflare remains the final DKIM, ARC, return-path, and provider-suppression authority.

Cloudflare SMTP submissions are rejected locally if the complete MIME message exceeds Cloudflare's 5 MiB limit. The adapter also maps Cloudflare Email Sending's structured `message.delivered`, `message.bounced`, and `message.complained` subscription payloads into the stable PaperBoy event names without retaining recipient, subject, or raw SMTP-response fields.

## Console, REST, and MCP

The signed-in Organisation page shows the default, safe readiness, capabilities, connection-test controls, and each domain override. Timestamps render in the signed-in user's persisted IANA timezone.

REST uses:

- `GET /api/v1/providers` to inspect settings and readiness;
- `PATCH /api/v1/providers` to update `default_provider` and `domain_overrides`;
- `POST /api/v1/providers/test` with only a provider ID.

MCP peers are `paperboy_get_outbound_providers`, `paperboy_update_outbound_providers`, and `paperboy_test_outbound_provider`, plus `paperboy://docs/outbound-providers`. MCP and REST timestamps stay RFC 3339 UTC. None accepts an organisation ID or credential argument; tenant context comes from the authenticated API key.
