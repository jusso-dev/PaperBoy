import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  DNS_GUIDE_CLOUDFLARE_ROUTING_SPF,
  DNS_GUIDE_DIRECT_IPV4_SPF,
  DNS_GUIDE_QUARANTINE_DMARC,
  DNS_GUIDE_STARTER_DMARC,
  DNS_OPERATOR_GUIDE,
} from "../src/lib/dns-operator-guide.ts";
import {
  DEFAULT_SPF_RECORD,
  starterDmarcRecord,
} from "../src/lib/domain-core.ts";

const committedGuide = await readFile(
  new URL("../docs/dns.md", import.meta.url),
  "utf8",
);

test("committed DNS documentation is the exact MCP guide", () => {
  assert.equal(committedGuide, DNS_OPERATOR_GUIDE);
});

test("DNS guide matches domain verification values and transition policy", () => {
  assert.equal(committedGuide.includes(DEFAULT_SPF_RECORD), true);
  assert.equal(DNS_GUIDE_STARTER_DMARC, starterDmarcRecord("mail.example.com"));
  assert.equal(committedGuide.includes(DNS_GUIDE_DIRECT_IPV4_SPF), true);
  assert.equal(committedGuide.includes(DNS_GUIDE_CLOUDFLARE_ROUTING_SPF), true);
  assert.equal(committedGuide.includes(DNS_GUIDE_STARTER_DMARC), true);
  assert.equal(committedGuide.includes(DNS_GUIDE_QUARANTINE_DMARC), true);
  assert.match(committedGuide, /must not have two TXT records beginning with `v=spf1`/);
  assert.match(committedGuide, /do not establish legal or regulatory compliance/);
});
