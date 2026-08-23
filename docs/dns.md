# PaperBoy DNS operator guide

This guide covers SPF and DMARC for a PaperBoy sending domain. It uses `mail.example.com`, the documentation-only IPv4 address `203.0.113.10`, and the documentation-only IPv6 address `2001:db8::10`. Replace all three with your real sending domain and public outbound addresses.

The same guide is available to authenticated agents as the MCP resource `paperboy://docs/dns`.

## Choose the outbound transport first

PaperBoy can sign mail for a self-hosted SMTP/MTA path, or hand an unsigned message to a provider such as Cloudflare Email Sending. Do not configure both paths as though they sign and send the same message.

For a PaperBoy-signed self-hosted MTA, identify the public IP address that the recipient's mail server sees. Do not use a private LAN address. PaperBoy does not publish a shared SPF include domain; authorise the sending address directly with `ip4:` and, when used, `ip6:`.

## SPF for a PaperBoy-signed MTA

Set `PAPERBOY_SPF_RECORD` to the complete record before adding or checking the domain. Restart the PaperBoy process after changing its environment. The console and MCP then show and verify that exact value.

IPv4 only:

```dotenv
PAPERBOY_SPF_RECORD="v=spf1 ip4:203.0.113.10 ~all"
```

IPv4 and IPv6:

```dotenv
PAPERBOY_SPF_RECORD="v=spf1 ip4:203.0.113.10 ip6:2001:db8::10 ~all"
```

The fallback value is `v=spf1 mx ~all`. Use it only when the domain's MX hosts really are the outbound senders. Direct `ip4:` and `ip6:` mechanisms are clearer for a box with fixed public addresses.

Publish the value from the PaperBoy domain screen or `paperboy_list_domains` as one TXT record at the sending domain:

| Type | Host | Value |
| --- | --- | --- |
| TXT | `mail.example.com` | `v=spf1 ip4:203.0.113.10 ~all` |

Use `@` only when the DNS provider uses it to mean the exact sending domain. Some providers expect the full hostname instead. Enter the value without surrounding quotation marks in dashboards that add them automatically.

A DNS owner name must not have two TXT records beginning with `v=spf1`; merge every legitimate sender into one record. `include`, `a`, `mx`, `exists`, and `redirect` can cause DNS lookups, and SPF permits at most 10 lookup-causing terms. The direct `ip4:` and `ip6:` mechanisms do not consume that lookup budget.

## Cloudflare Email Routing with a PaperBoy MTA

Cloudflare Email Routing is an inbound forwarding service. When Routing and PaperBoy use the same DNS owner name, merge Cloudflare's include with the PaperBoy sender IP in the one SPF record:

```dotenv
PAPERBOY_SPF_RECORD="v=spf1 ip4:203.0.113.10 include:_spf.mx.cloudflare.net ~all"
```

Publish:

| Type | Host | Value |
| --- | --- | --- |
| TXT | `mail.example.com` | `v=spf1 ip4:203.0.113.10 include:_spf.mx.cloudflare.net ~all` |

If Routing is on `example.com` and PaperBoy sends from `mail.example.com`, those are different owner names. Each can have its own single SPF record. Merge only when both services publish SPF at the same name.

Keep Cloudflare Routing's MX records and `cf2024-1._domainkey` DKIM record. Keep PaperBoy's separate `pb..._domainkey` record. If Cloudflare locks the Routing SPF record, unlock it from Email Routing settings before replacing it with the merged value; do not create a second SPF record.

## Cloudflare Email Sending

Cloudflare Email Sending is an outbound provider, not the same service as Email Routing. Cloudflare creates and manages SPF on `cf-bounce.<domain>`, DKIM on `cf-bounce._domainkey.<domain>`, and a DMARC record on `_dmarc.<domain>`. Use the exact records shown in Cloudflare's Email Sending settings.

Do not add the PaperBoy box IP to Cloudflare's `cf-bounce` SPF record, and do not replace Cloudflare's provider-managed DKIM selector with a PaperBoy selector. PaperBoy must hand this transport an unsigned, undated message so Cloudflare remains the signing authority.

If the same From domain also sends directly from your PaperBoy MTA, keep the direct sender policy at that domain and Cloudflare's separate policy at `cf-bounce.<domain>`. There is still only one SPF record at each owner name.

## Starter DMARC

Create `dmarc@mail.example.com`, or change the `rua` address below to a monitored mailbox that already exists. DMARC aggregate reports are XML attachments and may contain information about your sending sources.

Start in monitoring mode:

| Type | Host | Value |
| --- | --- | --- |
| TXT | `_dmarc.mail.example.com` | `v=DMARC1; p=none; rua=mailto:dmarc@mail.example.com` |

Keep `p=none` until reports show every legitimate sender passing aligned SPF or DKIM. PaperBoy's Verified status proves that its configured ownership, SPF, and active DKIM records resolve; it does not inspect DMARC reports or inventory other systems that send as your domain.

After correcting legitimate failures, replace the same TXT record with:

| Type | Host | Value |
| --- | --- | --- |
| TXT | `_dmarc.mail.example.com` | `v=DMARC1; p=quarantine; rua=mailto:dmarc@mail.example.com` |

Do not publish a second DMARC record. If Cloudflare Email Sending already manages `_dmarc.<domain>`, treat the value in its settings as authoritative and change policy through the supported Cloudflare workflow rather than adding another record.

## Publish and verify

1. Configure and restart PaperBoy with the complete `PAPERBOY_SPF_RECORD`.
2. Add the sending domain in the console or with `paperboy_create_domain`.
3. Publish the exact ownership, SPF, and pending DKIM TXT records PaperBoy returns.
4. Publish the starter DMARC record after confirming its reporting mailbox.
5. Query the public records from outside your private network:

```sh
dig +short TXT mail.example.com
dig +short TXT _dmarc.mail.example.com
dig +short TXT _paperboy.mail.example.com
dig +short TXT <selector>._domainkey.mail.example.com
```

6. Run Check DNS in the console or `paperboy_verify_domain`. Live sending remains blocked until ownership, the exact configured SPF value, and an active PaperBoy DKIM selector match.

DNS caches may delay a new result. PaperBoy reports timestamps over MCP in UTC and displays console timestamps in the signed-in user's persisted IANA timezone; timezone settings do not change DNS values.

## References

- [IETF RFC 7208: Sender Policy Framework](https://datatracker.ietf.org/doc/html/rfc7208)
- [IETF RFC 7489: DMARC](https://datatracker.ietf.org/doc/html/rfc7489)
- [Cloudflare Email Service domain configuration](https://developers.cloudflare.com/email-service/configuration/domains/)
- [Cloudflare Email authentication](https://developers.cloudflare.com/email-service/concepts/email-authentication/)

These records configure email authentication and handling policy. They do not establish legal or regulatory compliance.
