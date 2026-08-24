# PaperBoy TypeScript SDK

Small, handwritten HTTP client for the versioned PaperBoy send and message-detail surface. It uses the platform `fetch` implementation and has no runtime dependencies.

```ts
import { PaperBoy } from "@paperboy/sdk";

const paperboy = new PaperBoy({
  apiKey: process.env.PAPERBOY_API_KEY!,
  baseUrl: "https://paperboy.example",
});

const queued = await paperboy.send(
  {
    from: "PaperBoy <news@mail.example.com>",
    to: "reader@example.net",
    subject: "Morning edition",
    text: "Hello",
  },
  { idempotencyKey: "morning-edition-2026-08-24" },
);

const message = await paperboy.get(queued.id);
```

Keep the API key in a secret environment, never client-side browser code. Every returned protocol timestamp is an RFC 3339 UTC string; localise only at presentation time with an explicit IANA timezone.

`idempotencyKey` sends the `Idempotency-Key` header. PaperBoy scopes it to this API key for 24 hours using PostgreSQL UTC instants. Same body returns the original ID; a changed body fails with `PaperBoyError` status 409. Replays never create another queue row or reach SMTP/Cloudflare Email Service. Raw HTTP clients may instead send the matching JSON `idempotency_key` field.

The SDK queues the same provider-neutral semantic message as raw HTTP and the first-class `paperboy_send_email` MCP tool. A self-hosted SMTP worker and Cloudflare Email Service therefore receive the same validated content, limits, suppressions, and event contract; Cloudflare remains responsible for its provider-owned DKIM/ARC signatures.

Build distributable JavaScript and declarations with `bun run sdk:build`. Generated `packages/sdk/dist` files are intentionally ignored and must not be committed.
