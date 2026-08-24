# Bounce and complaint ingestion

PaperBoy ingests standard RFC 3464 delivery status notifications (DSNs) and RFC 5965 abuse feedback reports (ARFs). It never sends another email to test an address.

Hard-bounce DSNs with a `5.x.x` status create a `bounced` event and an organization suppression. Transient `4.x.x` DSNs create a `bounced` event classified as `soft_bounce`, without suppression. ARFs create a `complained` event and complaint suppression. Exact raw-report replays return the original event without duplicating it.

The raw report is capped at 10 MiB and is not stored. Correlation requires one PaperBoy UUID from `Original-Envelope-Id`, `X-PaperBoy-Message-ID`, or the original `Message-ID`, plus a reported recipient belonging to that organization message. Future HTTP, MCP, batch, and broadcast sends check the same suppression table before inserting a queue row and return `recipient_suppressed` with a reason.

Prefer header-only DSNs (`RET=HDRS`). A report is untrusted and may contain original message content; pass it only over the authenticated MCP transport or local stdin hook, never in a prompt, URL, log, or command argument.

## Postfix pipe

Choose a dedicated address on a domain whose MX delivers to this Postfix instance, for example `paperboy-bounce@bounces.example.com`. Set this on every PaperBoy SMTP job process:

```dotenv
PAPERBOY_BOUNCE_ADDRESS=paperboy-bounce@bounces.example.com
```

PaperBoy then uses that address as SMTP `MAIL FROM`, adds `X-PaperBoy-Message-ID`, and requests failure/delay DSNs with the message UUID as `ENVID`. The visible `From` header does not change. The upstream MTA must advertise the optional SMTP DSN extension for `ENVID`, `RET=HDRS`, and `NOTIFY=FAILURE,DELAY` to take effect; header correlation remains as fallback.

Create a separate organization API key whose creator remains an owner or admin. Store the raw key in a file readable only by the unprivileged `paperboy` account; do not put it in `master.cf`, a command argument, source control, or logs. Configure the deployed app directory's protected `.env` with `DATABASE_URL` and:

```dotenv
PAPERBOY_FEEDBACK_API_KEY_FILE=/run/secrets/paperboy_feedback_api_key
```

Add an indexed transport entry. Postfix tries the full `user+extension@domain` address and then the base `user@domain`, so this base entry also catches tagged return paths when `recipient_delimiter = +`:

```text
# /etc/postfix/transport
paperboy-bounce@bounces.example.com paperboy-feedback:
```

```text
# /etc/postfix/main.cf
recipient_delimiter = +
transport_maps = hash:/etc/postfix/transport
paperboy-feedback_destination_recipient_limit = 1
```

Define a final-delivery pipe. Adjust executable and deployment paths to their exact installed locations. Postfix executes `argv` directly without a shell:

```text
# /etc/postfix/master.cf
paperboy-feedback unix - n n - - pipe
  flags=Rq user=paperboy directory=/srv/paperboy size=10485760
  argv=/usr/local/bin/bun run feedback:ingest
```

Then rebuild the indexed table and reload Postfix:

```sh
postmap /etc/postfix/transport
postfix reload
```

`bun run feedback:ingest` reads one raw RFC 822 report from stdin, authenticates the protected tenant key, writes content-free JSON to stdout, and exits nonzero for malformed, oversized, unauthorized, or uncorrelated reports. Validate parsing with committed fixtures and no outbound delivery:

```sh
bun test tests/feedback-core.test.mjs
```

## Cloudflare Email Service

Cloudflare Email Sending replaces `Return-Path` with its provider-managed `cf-bounce` domain and performs its own bounce processing and suppression checks. Keep that boundary: do not point Cloudflare's `cf-bounce` MX records at this Postfix hook and do not replace its return path. Cloudflare SMTP submission remains compatible with PaperBoy's provider-neutral queue, message events, and signed webhooks. PaperBoy can ingest a standard report only when it is separately routed to the configured hook; this Postfix path does not claim to replace Cloudflare's provider analytics or suppression pipeline.

## Amazon SES

Amazon SES feedback uses configuration-set event publishing, not the Postfix pipe. Add delivery, delivery-delay, bounce, and complaint event types to an SNS or EventBridge destination. `SendEmail` and `SendBulkEmail` attach the stable `paperboy_message_id` tag, and PaperBoy also verifies the returned SES message ID before accepting an event for one organization message.

Use the signed public SNS callback only with the exact per-organization topic ARN and SNS signature version 2. EventBridge API Destinations use the authenticated SES event REST endpoint; an owner/admin can use the first-class `paperboy_ingest_outbound_provider_event` MCP peer for the same bounded service. Raw AWS payloads are never stored. Permanent bounces and complaints add suppressions, while transient bounces and delivery delays record content-free events without suppression. Exact provider-event replays are idempotent.

All stored instants and API/MCP timestamps remain RFC 3339 UTC. Console presentation uses fixed `Australia/Sydney` time.

References: [RFC 3464 DSNs](https://www.rfc-editor.org/rfc/rfc3464), [RFC 5965 ARFs](https://www.rfc-editor.org/rfc/rfc5965), [Nodemailer DSN options](https://nodemailer.com/message/dsn), [Postfix transport tables](https://www.postfix.org/transport.5.html), [Postfix pipe delivery](https://www.postfix.org/pipe.8.html), [Cloudflare Email Sending lifecycle](https://developers.cloudflare.com/email-service/concepts/email-lifecycle/), and [Amazon SES event publishing](https://docs.aws.amazon.com/ses/latest/dg/monitor-using-event-publishing.html).
