import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { DnsRecordTable } from "../src/app/app/domains/dns-record-table.tsx";
import { copyExactDnsTxtValue } from "../src/lib/dns-copy.ts";

test("DNS copy writes the exact TXT value without normalization", async () => {
  const value = "v=DKIM1; k=rsa; p=AbC+/0123==";
  let copied;

  await copyExactDnsTxtValue({ value }, async (received) => {
    copied = received;
  });

  assert.equal(copied, value);
});

test("DNS copy reports clipboard failures to its caller", async () => {
  await assert.rejects(
    copyExactDnsTxtValue({ value: "v=spf1 mx ~all" }, async () => {
      throw new Error("clipboard unavailable");
    }),
    /clipboard unavailable/,
  );
});

test("DNS copy refuses records whose value has not been generated", async () => {
  await assert.rejects(
    copyExactDnsTxtValue({ value: null }, async () => {
      assert.fail("clipboard writer must not run");
    }),
    /no TXT value/,
  );
});

test("every DNS record renders a labelled copy control", () => {
  const markup = renderToStaticMarkup(
    createElement(DnsRecordTable, {
      domainName: "mail.example.com",
      records: [
        {
          check: "matched",
          description: "Proves domain ownership.",
          key: "ownership",
          name: "_paperboy.mail.example.com",
          required: true,
          type: "TXT",
          value: "paperboy-verification=exact-token",
        },
        {
          check: "pending",
          description: "Signs outbound mail.",
          key: "dkim",
          name: "_domainkey.mail.example.com",
          required: true,
          type: "TXT",
          value: null,
        },
      ],
    }),
  );

  assert.equal((markup.match(/>Copy value<\/button>/g) ?? []).length, 2);
  assert.match(
    markup,
    /aria-label="Copy OWNERSHIP TXT value for _paperboy\.mail\.example\.com"/,
  );
  assert.match(markup, /disabled=""/);
  assert.match(markup, /Matched/);
  assert.match(markup, /Pending setup/);
});
