# Outbound providers

PaperBoy keeps the public `POST /api/v1/emails` payload Resend-shaped while making delivery routing an organisation setting. SMTP, Cloudflare Email Service, Amazon SES, and Azure Communication Services Email are stable provider identities behind one contract. Test API keys always use the isolated `test-sink` identity.

## Routing and queue snapshots

Each organisation has one default live provider. A sending domain may inherit it or override it. PaperBoy resolves the effective provider only after validating the live key, tenant-owned verified domain, active DKIM state, suppressions, and provider readiness. The resolved provider is stored on the message in the same queue transaction.

Changing a default or domain override affects future messages only. Existing queued messages retain their provider, PaperBoy message ID, event names, retry state, and webhook contract. PaperBoy never silently falls back to SMTP when another provider is unavailable.

The provider contract includes:

- one-message send and an optional batch method;
- an optional scheduling method, advertised only when the adapter implements it;
- provider connection testing;
- provider-event mapping into PaperBoy `delivered`, `deferred`, `bounced`, and `complained` events;
- a safe provider message-ID receipt for private correlation.

Amazon SES is a live SES v2 delivery and event adapter. Azure remains a selectable contract identity for its dedicated card; selecting Azure before its adapter exists returns an explicit `provider_adapter_unavailable` 422 response.

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

## Amazon SES

Amazon SES uses the regional SES v2 API. `SendEmail` receives a complete raw MIME message, so attachments, text/HTML alternatives, the stable PaperBoy header, and the stored semantic content remain identical to SMTP. PaperBoy supplies the selected configuration set plus a `paperboy_message_id` message tag and stores the `MessageId` returned by SES. SES Easy DKIM remains the signing authority; PaperBoy does not add a second DKIM signature on this path.

The provider adapter exposes the real `SendBulkEmail` operation for compatible groups of 1–50 messages. Entries may have different recipients, subjects, and body values, but must share one sender, body-part shape, and attachment set because SES bulk content has one common template and attachment collection. Each entry keeps its own PaperBoy ID in replacement headers and tags. A partial SES bulk result fails closed and is not automatically replayed, avoiding duplicate submissions for entries SES already accepted. The current queue worker claims one row at a time and therefore uses recipient-specific `SendEmail`; callers that batch at the provider-contract layer receive each bulk entry's SES message ID in input order.

Every SES request passes through a PostgreSQL quota guard shared by all PaperBoy workers using the same database and credential scope. The adapter refreshes the regional `GetAccount` quota for at most 60 seconds, reserves recipients rather than API calls, schedules at 80% of `MaxSendRate`, and caps rolling 24-hour reservations at 90% of `Max24HourSend`. Capacity deferrals preserve the queue row and do not consume a delivery attempt. SES throttling is treated as a non-consuming transient deferral because SES can accept below its advertised maximum. This guard complements—not bypasses—SES account, identity, reputation, suppression, and recipient-level controls.

Set the operator defaults in the deployment secret store:

```text
AWS_SES_REGION=ap-southeast-2
AWS_SES_CONFIGURATION_SET=paperboy-events
AWS_SES_SNS_TOPIC_ARN=arn:aws:sns:ap-southeast-2:123456789012:paperboy-ses-events

# Choose an IAM role, an access-key pair, or the explicit workload chain.
AWS_SES_ROLE_ARN=arn:aws:iam::123456789012:role/paperboy-ses
AWS_SES_EXTERNAL_ID=operator-generated-external-id
# AWS_SES_ACCESS_KEY_ID=...
# AWS_SES_SECRET_ACCESS_KEY=...
# AWS_SES_SESSION_TOKEN=...
# AWS_SES_USE_DEFAULT_CREDENTIAL_CHAIN=true
```

Every region, event, and credential setting has a per-organisation form. Replace `<ORG>` with the uppercased organisation UUID whose dashes became underscores:

```text
PAPERBOY_AWS_SES_REGION_<ORG>=ap-southeast-2
PAPERBOY_AWS_SES_CONFIGURATION_SET_<ORG>=paperboy-events
PAPERBOY_AWS_SES_SNS_TOPIC_ARN_<ORG>=arn:aws:sns:ap-southeast-2:123456789012:paperboy-ses-events
PAPERBOY_AWS_SES_ROLE_ARN_<ORG>=arn:aws:iam::123456789012:role/paperboy-ses-org
PAPERBOY_AWS_SES_EXTERNAL_ID_<ORG>=operator-generated-external-id
# Or use all of PAPERBOY_AWS_SES_ACCESS_KEY_ID_<ORG>,
# PAPERBOY_AWS_SES_SECRET_ACCESS_KEY_<ORG>, and optional PAPERBOY_AWS_SES_SESSION_TOKEN_<ORG>.
```

When any organisation-scoped credential field exists, PaperBoy resolves the complete credential set only from that scope; it never fills a partial tenant key from operator defaults. A role may use an accompanying access-key pair as its source credentials or the workload's default chain. Without a role or static pair, the default chain is accepted only when `AWS_SES_USE_DEFAULT_CREDENTIAL_CHAIN=true` explicitly opts in. Region, role ARN, configuration-set name, topic ARN, and key completeness are validated before a live queue row is inserted.

`POST /api/v1/providers/test` and `paperboy_test_outbound_provider` call SES `GetAccount` and paginate `ListEmailIdentities`. Their safe result reports only region, `sandbox` or `production`, whether sending is enabled, and normalized domain identities whose verification is `SUCCESS` and sending is enabled. The console shows the same verified-domain list in the signed-in user's flow; AWS keys, account identifiers, quota values, unverified identities, individual email identities, and raw provider responses remain hidden. The IAM principal therefore needs `ses:ListEmailIdentities` in addition to its send and `ses:GetAccount` permissions.

### SES events

Create an SES configuration-set event destination for delivery, delivery delay, bounce, and complaint events. PaperBoy accepts either:

- signed Amazon SNS delivery at `POST /api/v1/providers/aws-ses/events/<ORGANISATION_UUID>` with the exact configured topic ARN; or
- an EventBridge API Destination at authenticated `POST /api/v1/providers/aws-ses/events` using a tenant-bound PaperBoy API key.

Configure SNS signature version 2. The public endpoint accepts only the configured topic, validates the AWS-hosted certificate URL and cryptographic signature before parsing the embedded SES message, and handles a valid subscription confirmation automatically. The authenticated REST and `paperboy_ingest_outbound_provider_event` MCP peers use the API key's tenant and current owner/admin role instead. Provider payloads are bounded to 512 KiB and are never stored.

PaperBoy correlates the message tag and SES message ID to exactly one queued organisation message. Provider event replays are idempotent. Delivery creates `delivered`; delivery delay creates `deferred`; a permanent bounce creates `bounced` plus a `bounced` suppression; a complaint creates `complained` plus a `complained` suppression. Transient bounces and delays do not suppress. Persisted event data contains safe classifications and counts, never addresses, diagnostics, SMTP responses, subjects, bodies, credentials, or the raw AWS payload.

## Console, REST, and MCP

The signed-in Organisation page shows the default, safe readiness, capabilities, connection-test controls, and each domain override. Timestamps render in fixed `Australia/Sydney` time.

REST uses:

- `GET /api/v1/providers` to inspect settings and readiness;
- `PATCH /api/v1/providers` to update `default_provider` and `domain_overrides`;
- `POST /api/v1/providers/test` with only a provider ID.
- `POST /api/v1/providers/aws-ses/events` for API-key-authenticated EventBridge or operator ingestion;
- `POST /api/v1/providers/aws-ses/events/<ORGANISATION_UUID>` for signed SNS only.

MCP peers are `paperboy_get_outbound_providers`, `paperboy_update_outbound_providers`, `paperboy_test_outbound_provider`, and `paperboy_ingest_outbound_provider_event`, plus `paperboy://docs/outbound-providers`. MCP and authenticated REST timestamps stay RFC 3339 UTC. None accepts an organisation ID or credential argument; tenant context comes from the authenticated API key. The organisation ID appears only in the signed-SNS callback URL because SNS cannot supply a PaperBoy bearer key; its signature and configured topic establish the provider trust boundary.
