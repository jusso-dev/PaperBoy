# PaperBoy threat model

## Overview

PaperBoy is a multi-tenant transactional email service. Its console, REST API, and Model Context Protocol (MCP) server use the same domain services and authorization rules. Live messages leave through an operator-controlled SMTP service or Cloudflare Email Service; test-key messages remain in the isolated test sink. PostgreSQL is the source of truth for tenants, authorization, rate limits, queue state, message metadata, and delivery events. Attachment bytes live in a private operator-controlled filesystem.

This model covers the repository at source revision `d4390fd5695dd3e956064c8933cc937845066874`. It focuses on API keys, sessions, DKIM material, SMTP and Cloudflare credentials, webhook secrets, attachment storage, outbound delivery, MCP, CI, and date/time handling. It is a design and operations boundary, not a claim that secret scanning or application controls can compensate for a compromised host, database administrator, provider account, source-control account, or mail transfer agent (MTA).

Security invariants:

- Tenant and `live`/`test` environment come from the authenticated session or API-key principal, never a caller-supplied organization ID. REST and MCP enforce the same boundary.
- A live message requires a verified organization-owned domain and active DKIM state. A test key cannot select a live provider.
- Stored instants and REST/MCP timestamps are UTC. Calendar boundaries and console presentation use the authenticated user's persisted IANA timezone, so process-local time cannot silently change authorization, rate-limit, idempotency, or scheduling behavior.
- Raw API keys and webhook secrets are returned only at creation. API-key hashes and context-bound encrypted DKIM/webhook material are stored instead of plaintext secrets.
- Cloudflare structured messages omit PaperBoy-owned `Date`, DKIM, and ARC headers. Cloudflare remains the signing authority. Self-hosted SMTP signs only in the self-hosted path.
- Attachments are private, root-confined, integrity-checked blobs. Public APIs and MCP expose metadata, not bytes, hashes, or storage keys.
- Queue creation, rate limiting, and idempotency decisions are transactional. Delivery remains at least once.
- Fork pull requests never execute on the self-hosted CI runner. Secret scanning runs against full Git history before dependency installation or repository code execution.

## Threat Model, Trust Boundaries, and Assumptions

### Protected assets

- PaperBoy bearer API keys, Better Auth sessions and secret, and MCP process credentials.
- DKIM private keys; webhook signing secrets; webhook/DKIM encryption keys; unsubscribe signing keys.
- SMTP usernames/passwords and Cloudflare Email Service API tokens embedded in `SMTP_URL`.
- PostgreSQL tenant, membership, domain, recipient, template, message, event, suppression, queue, and idempotency data.
- Private attachment bytes and their integrity metadata.
- Sending-domain DNS, DKIM/SPF records, provider account, IP/domain reputation, and suppression state.
- CI runner registration tokens, the runner host, Docker socket, repository credentials, and release integrity.
- The user's IANA timezone and UTC timestamps used for calendar filters, limits, schedules, logs, and signatures.

### Actors and boundaries

| Boundary | Trust granted | Data crossing it |
| --- | --- | --- |
| Public browser to Next.js | Untrusted until Better Auth validates a server session | Auth input, unsubscribe tokens, console requests |
| REST or HTTP MCP client to PaperBoy | Untrusted until a bearer key is parsed, hashed, matched, and checked for revocation | JSON/MCP arguments, API key, idempotency key |
| Local MCP stdio client to PaperBoy | The launching operator controls its environment and process boundary | Database URL, PaperBoy API key, feature secrets, MCP messages |
| PaperBoy services to PostgreSQL | Database and its administrators are trusted infrastructure | Tenant data, encrypted secret envelopes, queue state, timestamps |
| Web/worker to attachment storage | Host, mount, permissions, and backups are trusted infrastructure | Private attachment bytes and generated storage keys |
| Worker to self-hosted SMTP/MTA | Operator must enforce authentication, relay policy, TLS, egress, and reputation controls | Credentials and raw MIME, optionally PaperBoy DKIM-signed |
| Worker to Cloudflare Email Service | Cloudflare account, API token, TLS endpoint, and provider controls are trusted | SMTP MIME or future structured payload; Cloudflare owns final DKIM/ARC and `cf-bounce` behavior |
| Worker to webhook receiver | Receiver identity and HTTPS endpoint are configured by an organization owner/admin | Minimal event body plus timestamped HMAC signature |
| PaperBoy/operator to DNS | Registrar, DNS provider, and change-control accounts are trusted | SPF and DKIM public records, domain verification |
| GitHub to self-hosted CI runner | Same-repository contributors and workflow definitions are trusted to run code | Source, actions, service containers, runner token, Docker access |

Callers can control request bodies, IDs, headers, email addresses and content, template data and author-authored HTML, attachments, import/feedback payloads, webhook endpoint URLs, MCP arguments, and replay timing. Remote SMTP servers, webhook receivers, providers, and DNS can return attacker-influenced responses. Operators control deployment secrets, network policy, PostgreSQL, private storage, SMTP relay policy, Cloudflare configuration, DNS, source-control permissions, and the runner host.

The deployment assumptions are explicit:

- Production secrets come from a protected secret store, are independently generated, and are available only to the processes that need them. They are not placed in Git, images, command-line arguments, logs, or MCP configuration committed to the repository.
- Web, MCP, and worker processes use `TZ=UTC`. Every signed-in account stores a canonical IANA timezone. Provider timestamps are normalized to UTC before persistence or protocol output.
- PostgreSQL, attachment storage, backups, and observability stay in the approved region with least-privilege access, encryption, recovery testing, and retention controls.
- SMTP submission requires authenticated TLS. Cloudflare Email Service uses the literal `api_token` username, an URL-encoded API token, implicit TLS on port 465, and a narrowly scoped token.
- Production egress policy limits SMTP, Cloudflare, DNS, and webhook traffic. DNS resolution and connection targets are monitored to reduce private-network access and DNS-rebinding risk.
- Repository and branch protections restrict same-repository workflow changes. Self-hosted runners are disposable, isolated from production secrets and networks, and hold no durable credentials after a job.

## Attack Surface, Mitigations, and Attacker Stories

### Authentication, tenant isolation, and MCP

An attacker may steal a `pb_live_...` key and call REST or MCP tools. PaperBoy stores only the SHA-256 hash, parses a public key identifier before lookup, compares hashes in constant time, checks revocation and environment, and derives the organization from the authenticated principal. MCP tools do not accept an arbitrary organization ID and re-use domain services and role checks rather than forming a parallel privileged API.

The honest limit is that hashing protects the database copy, not an active bearer token. A leaked API key grants that key's organization/environment capabilities until it is revoked. A leaked local MCP environment also exposes every credential available to that child process. Operators must scope keys, avoid production keys in agent transcripts/configuration, monitor `lastUsedAt`, and revoke on suspicion.

A forged navigation cookie may pass the lightweight route guard, but protected data access still requires the server-side Better Auth session. Account takeover, a leaked Better Auth secret, or a compromised source-control/operator account remains capable of crossing the intended boundary.

### DKIM, SMTP, and Cloudflare Email Service

An attacker may try to extract or substitute a DKIM private key. PaperBoy generates 2048-bit RSA material, encrypts private keys with AES-256-GCM, uses a random IV, authenticates the ciphertext, and binds the envelope to the domain/key identifiers as additional authenticated data. The encryption key stays outside PostgreSQL. Self-hosted signing rejects duplicate protected headers and signs a bounded header set.

If an attacker obtains both PostgreSQL contents and `PAPERBOY_DKIM_ENCRYPTION_KEY`, they can decrypt DKIM private keys. If a DKIM key, DNS account, SMTP credential, or Cloudflare API token leaks, the attacker may send mail, spoof the domain, consume provider quota, or damage reputation outside PaperBoy. Rotate the affected application and provider/DNS credentials, revoke old keys, and publish replacement DKIM records.

PaperBoy cannot prevent an open relay, sender spoofing, plaintext submission, or reputation damage when the operator configures the MTA incorrectly. The MTA must require authenticated TLS submission, restrict relay networks and sender domains, isolate bounce handling, and keep its own audit controls. `SMTP_TLS_MODE=opportunistic` and `disabled` are development/exception modes, not production defaults.

Cloudflare Email Service is a first-class live-provider boundary, not a special bypass. Its SMTP credential is supplied through `SMTP_URL`, the same queue/rate-limit/suppression path applies, and Cloudflare remains responsible for provider-owned DKIM, ARC, bounce, and suppression behavior. A successful PaperBoy submission is not proof of final delivery. Cloudflare can reject, suppress, delay, or reclassify a message after acceptance. The future structured adapter must continue omitting `Date`, DKIM, and ARC headers so PaperBoy does not double-sign provider messages.

### Webhooks and outbound requests

An attacker may forge, replay, or alter a webhook. PaperBoy signs the exact raw body with HMAC-SHA256, includes an event ID and Unix timestamp, compares signatures in constant time, and documents a five-minute verification tolerance. The generated `whsec_...` value is returned only once; the database stores an AES-256-GCM envelope bound to the organization/endpoint context. Event bodies exclude recipients, subjects, message bodies, attachments, credentials, and provider payloads.

Production endpoints require HTTPS, redirects are not followed automatically, requests time out, and retry behavior is bounded. HTTPS alone does not prevent a configured URL from resolving to a private/reserved address or rebinding between validation and connection. Until application-level address pinning exists, operators must enforce outbound DNS and network policy and treat webhook configuration as an egress/SSRF-capable privilege.

If `PAPERBOY_WEBHOOK_ENCRYPTION_KEY` and the database both leak, stored signing secrets can be decrypted. Rotate the master key and each receiver secret. Stable event IDs plus at-least-once delivery mean receivers must also deduplicate valid retries.

### Templates, messages, recipients, and attachments

Template authors control email HTML. PaperBoy supports only bounded dotted variable substitution, rejects helpers/expressions/prototype-sensitive keys, escapes HTML substitutions, and sandboxes the console preview without scripts, forms, same-origin credentials, navigation, or remote subresources. Recipients still receive author-controlled HTML in their mail client; safe template review and mail-client defenses remain necessary.

Attachment filenames never become paths. Bytes are written under generated root-confined keys with restrictive permissions and exclusive creation, then size and SHA-256 integrity are checked before delivery. Public status surfaces expose metadata only. Host administrators, compromised application processes, unsafe mounts, snapshots, and backups can still read attachment bytes. The web and worker must share a private, correctly permissioned volume and avoid serving it as static content.

Suppressions, per-organization limits, domain verification, API-key environment separation, and transactional queue insertion constrain abuse. They do not make outbound content trustworthy, stop every enumeration attempt, or replace provider/MTA abuse controls. A worker crash after a provider accepts a message but before `sent` commits can produce a duplicate because delivery is at least once.

### Time and timezone integrity

An attacker or misconfigured host may try to exploit local-time differences around midnight, daylight-saving transitions, signature windows, or retry boundaries. PaperBoy stores instants in PostgreSQL `timestamptz`, emits RFC 3339 UTC through REST/MCP, uses fixed UTC instants for rate-limit/idempotency/retry logic, and translates user calendar dates with the persisted canonical IANA timezone. CI and deployed processes set `TZ=UTC`.

Changing a user's timezone changes presentation and future calendar-boundary interpretation, not stored instants. Operators must keep tzdata current and must not accept arbitrary abbreviations or raw offsets as account timezones. External provider timestamps remain untrusted input until parsed, bounded, and normalized.

### Source control, dependencies, and CI

Gitleaks scans full Git history with its default rules plus explicit AWS access-key, PaperBoy API-key, webhook-secret, Base64 service-key, SMTP-credential, and Cloudflare Email SMTP-token patterns. The repository-pinned launcher downloads Gitleaks v8.30.1, verifies the release checksum manifest against a pinned SHA-256 digest, verifies the selected archive, and runs locally on the self-hosted runner. Source is not uploaded to a scanning SaaS. Private-key and environment files are ignored, but ignore rules are convenience controls rather than permission to store secrets in the worktree.

Secret detection can miss novel encodings, split secrets, low-entropy credentials, encrypted blobs, runtime leaks, or values introduced after the scan. It also cannot revoke a committed secret: remove the value from use, rotate it, investigate access, and then clean history under an approved incident procedure. A clean scan is evidence about known patterns, not proof that the repository contains no secrets.

Fork pull requests are skipped before reaching the self-hosted runner. Same-repository writers can still alter workflows and run code with the runner's Docker access. Branch protection, code review, minimal GitHub permissions, disposable registration, isolated networking, no production secrets, and post-job destruction are required. Third-party actions and downloaded binaries remain supply-chain boundaries even when versions and checksums are pinned.

### Secret handling response

For a suspected secret leak:

1. Revoke or rotate the API key, webhook secret, DKIM key, SMTP password, Cloudflare token, Better Auth secret, or encryption/signing key at its authority before treating source cleanup as containment.
2. Identify affected organizations, environments, provider submissions, runner jobs, logs, and MCP clients without copying the secret into tickets or chat.
3. Redeploy protected values, invalidate sessions/links where applicable, and verify old credentials fail.
4. Preserve scoped evidence and follow the operator incident process. Rewrite Git history only with explicit coordination because clones and caches retain old objects.

## Severity Calibration

### Critical

- Cross-tenant unauthenticated code execution or database compromise with broad plaintext access.
- Compromise of a signing/encryption authority that enables organization-wide spoofing at scale and has no effective containment short of emergency rotation.
- Self-hosted CI compromise that reaches production secrets or production infrastructure across tenants.

### High

- Cross-tenant read/write access to messages, recipients, attachments, domains, or secrets.
- Decryption or exfiltration of active DKIM/webhook material, SMTP credentials, or a Cloudflare Email token with demonstrated sending impact.
- Authentication or MCP authorization bypass that grants owner/admin capabilities or changes the authenticated tenant/environment.
- Practical webhook SSRF reaching sensitive private services or metadata endpoints.

### Medium

- Same-tenant privilege escalation, durable suppression/rate-limit bypass, or stored content execution requiring an authenticated lower-privilege member.
- Repeatable duplicate delivery, recipient/content disclosure, or timezone-boundary error with meaningful customer impact but no cross-tenant access.
- Secret-scanning bypass for a committed production credential without evidence it was used.

### Low

- Bounded metadata disclosure, confusing diagnostics, or hardening gaps requiring unlikely preconditions and exposing no secret/message content.
- Development-only insecure configuration that is explicitly rejected or safely defaulted in production.

Repository: target_sha256_dd02cf19c00d007aca419cc80c4a996aef94539bec9e6ee73d0cea8d61884915
Version: d4390fd5695dd3e956064c8933cc937845066874
