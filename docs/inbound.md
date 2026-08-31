# Inbound receiving

PaperBoy can store mail sent to a verified organization domain and notify a support desk when a customer answers.

## Send with Reply-To

Support desks should keep a branded `from` and set `reply_to` to a plus-address on a verified domain:

```json
{
  "from": "Acme Support <hello@mail.example.com>",
  "to": "customer@example.net",
  "reply_to": "reply+ticketToken@mail.example.com",
  "subject": "Re: Your ticket",
  "text": "We are looking into it."
}
```

PaperBoy writes that address to the MIME `Reply-To` header on SMTP, Amazon SES, and Cloudflare Email Sending. Do not replace `from` with the plus-address.

## Receive

The jobs process can poll a private S3 prefix the same way Autmin does: list objects, parse each raw RFC 822 message, store it for the unique live organization that owns a recipient domain, then delete the object. Leave `PAPERBOY_INBOUND_S3_BUCKET` and `PAPERBOY_INBOUND_S3_REGION` unset to disable polling. SES setup notifications stay in the bucket. Unmatched or unreadable objects stay for the next poll.

Point MX or an SES receipt rule at that bucket. A forwarder that posts to PaperBoy with an API key still works:

```sh
curl https://paperboy.example/api/v1/received-emails \
  -H 'Authorization: Bearer <PaperBoy API key>' \
  -H 'Content-Type: application/json' \
  --data '{"email":"<raw RFC 822>"}'
```

Parsed fields also work:

```json
{
  "from": "customer@example.net",
  "to": "reply+ticketToken@mail.example.com",
  "subject": "Re: Your ticket",
  "text": "The printer is still jammed."
}
```

A live key is accepted only when at least one `to` domain is a verified organization sending domain. Plus-addresses are valid. Test keys store into the test environment without live DNS checks. Identical content returns the original ID.

Returned mail is a sinkhole. Out-of-office auto-replies, vacation notices, DSN bounces, and similar delivery reports are accepted (`202` on HTTP, deleted from the S3 prefix) and never stored. They do not fire `email.received`. Correlate real bounce and complaint reports through the feedback ingest path instead.

## Webhook and fetch

If the organization has a webhook endpoint, PaperBoy queues `email.received`:

```json
{
  "type": "email.received",
  "created_at": "2026-08-26T00:00:00.000Z",
  "data": {
    "email_id": "11111111-1111-4111-8111-111111111111",
    "environment": "live",
    "from": "customer@example.net",
    "to": ["reply+ticketToken@mail.example.com"],
    "subject": "Re: Your ticket",
    "message_id": "orig@example.net"
  }
}
```

The body is not in the webhook. Fetch it with `GET /api/v1/received-emails/{email_id}` using the same API key. Signing stays the existing `webhook-id`, `webhook-timestamp`, and `webhook-signature` contract.
