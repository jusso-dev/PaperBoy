# Organization send-rate limits

PaperBoy limits accepted messages per organization, not per API key or process. Live and test keys use separate counters so sandbox traffic cannot consume production capacity. Every HTTP server, stdio or Streamable HTTP MCP server, batch, and broadcast shares the same PostgreSQL state.

## Defaults and organization overrides

Operators set whole-number defaults from 1 to 1,000,000:

```env
PAPERBOY_LIVE_RATE_LIMIT_PER_MINUTE=60
PAPERBOY_TEST_RATE_LIMIT_PER_MINUTE=600
```

The test default must be higher than live. Both variables must be present with the same values in every web and MCP process that can queue mail. Invalid or reversed values fail closed with `rate_limit_unavailable` instead of silently disabling protection.

Owners and admins can set nullable organization overrides in the Organization console. A blank field restores the operator default. Current members can read the effective settings. The console renders `updated_at` in fixed `Australia/Sydney` time; storage and protocol output remain UTC.

REST exposes `GET` and `PATCH /api/v1/rate-limits`. Tenant and actor context come only from the bearer key:

```json
{
  "live_limit_per_minute": 120,
  "test_limit_per_minute": 1200
}
```

Pass either field as `null` to clear that override. Responses return default, override, and effective values plus `updated_at` and `protocol_time_zone: "UTC"`. The effective test value must remain higher than live after applying defaults and partial updates.

MCP peers are `paperboy_get_rate_limits` and `paperboy_update_rate_limits`; neither accepts an organization ID. Their structured output includes UTC observation metadata and is documented at `paperboy://docs/rate-limits`.

## Atomic fixed windows

Windows are fixed UTC minutes. PostgreSQL stores at most one live and one test row per organization. Queue creation performs a conditional `INSERT ... ON CONFLICT DO UPDATE` on that row in the same transaction that inserts the message and its queued event. PostgreSQL serializes conflicting updates, so parallel requests across processes cannot read the same remaining slot and both exceed the cap. No in-process memory, paid Redis, or provider counter is involved.

Only a committed new message consumes capacity. Input or domain validation failures occur before the transaction. Suppression failures, attachment-storage failures, and message/event insert failures roll the transaction back. An `Idempotency-Key` replay returns the original message before the limiter; two concurrent copies that race to insert roll back the losing counter update before returning the winner.

## Retry contract

A capped single HTTP send returns status 429 and a delta-seconds `Retry-After` header:

```json
{
  "error": {
    "code": "rate_limit_exceeded",
    "environment": "live",
    "limit": 60,
    "message": "This organization reached its live send limit. Retry after 37 seconds.",
    "retry_after_seconds": 37
  }
}
```

The body and header use the same delay to the next UTC-minute boundary. MCP single-send errors report the same environment, limit, and retry delay. Batch items retain their input order: accepted neighbors remain queued, capped items contain `rate_limit_exceeded`, and the response carries `Retry-After`. Mixed results use 207; if every item is capped the response is 429.

Broadcast recipients consume ordinary queue slots. When one reaches the cap, PaperBoy restores that recipient to pending and pauses the broadcast. Resume after the current window resets; the recipient is not counted as failed or lost.

## SMTP and Cloudflare Email Sending

Rate limiting is part of PaperBoy's provider-neutral queue transaction. Rejected messages create no queue row, so neither a self-hosted SMTP adapter nor Cloudflare Email Sending receives them. Cloudflare keeps its independent account limits, `cf-bounce` return path, and provider suppression pipeline; those controls can still reject a message after PaperBoy accepts it. PaperBoy's cap does not replace or attempt to bypass them.

## Amazon SES provider quotas

Organization limits govern queue acceptance. SES quotas govern actual regional recipients sent and are enforced later by a separate PostgreSQL-backed guard shared across workers. It refreshes `GetAccount`, schedules at 80% of the observed recipient-per-second rate, and reserves no more than 90% of the rolling 24-hour allowance. A quota wait returns the row to `queued` at the calculated time without exhausting its five delivery attempts. Each ordinary SES worker delivery has exactly one recipient so bounces, complaints, suppression, and retry state remain recipient-specific; batch and broadcast creation still queue independent messages.
