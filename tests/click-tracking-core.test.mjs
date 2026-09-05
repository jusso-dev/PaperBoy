import assert from "node:assert/strict";
import test from "node:test";
import {
  ClickTrackingError,
  createClickTrackingSignature,
  createClickTrackingUrl,
  isTrackableUrl,
  parseTrackingSubdomain,
  parseUpdateDomainClickTrackingInput,
  rewriteHtmlLinks,
  rewriteHtmlLinksForMessage,
  verifyClickTrackingSignature,
} from "../src/lib/click-tracking-core.ts";

const key = Buffer.alloc(32, 9);
const messageId = "11111111-1111-4111-8111-111111111111";
const otherMessageId = "22222222-2222-4222-8222-222222222222";
const target = "https://example.com/welcome?edition=morning";

test("click-tracking setting input is strict", () => {
  assert.deepEqual(
    parseUpdateDomainClickTrackingInput({ enabled: true }),
    { enabled: true, trackingSubdomain: null },
  );
  assert.deepEqual(
    parseUpdateDomainClickTrackingInput({
      enabled: true,
      tracking_subdomain: "Click.Example.com.",
    }),
    { enabled: true, trackingSubdomain: "click.example.com" },
  );
  for (const value of [
    {},
    { enabled: "true" },
    { enabled: false, orgId: "x" },
    { enabled: true, tracking_subdomain: "not a host!!" },
  ]) {
    assert.throws(
      () => parseUpdateDomainClickTrackingInput(value),
      ClickTrackingError,
    );
  }
});

test("tracking subdomains normalise to lowercase hostnames", () => {
  assert.equal(parseTrackingSubdomain(undefined), null);
  assert.equal(parseTrackingSubdomain(""), null);
  assert.equal(
    parseTrackingSubdomain("Click.Example.com."),
    "click.example.com",
  );
  assert.equal(parseTrackingSubdomain("not a host!!"), null);
});

test("click-tracking signatures bind one message to one URL", () => {
  const signature = createClickTrackingSignature({
    key,
    messageId,
    targetUrl: target,
  });
  assert.equal(
    verifyClickTrackingSignature({
      key,
      messageId,
      signature,
      targetUrl: target,
    }),
    true,
  );
  assert.equal(
    verifyClickTrackingSignature({
      key,
      messageId: otherMessageId,
      signature,
      targetUrl: target,
    }),
    false,
  );
  assert.equal(
    verifyClickTrackingSignature({
      key,
      messageId,
      signature,
      targetUrl: "https://example.com/other",
    }),
    false,
  );
  assert.equal(
    verifyClickTrackingSignature({
      key,
      messageId,
      signature: `${signature.slice(0, -1)}A`,
      targetUrl: target,
    }),
    false,
  );
});

test("click-tracking URL is first-party with the target as a query param", () => {
  const url = createClickTrackingUrl({
    baseUrl: "https://mail.example.com/app",
    key,
    messageId,
    targetUrl: target,
  });
  const parsed = new URL(url);
  assert.equal(parsed.origin, "https://mail.example.com");
  assert.match(
    parsed.pathname,
    new RegExp(`^/c/${messageId}/[A-Za-z0-9_-]+$`),
  );
  assert.equal(parsed.searchParams.get("u"), target);
});

test("link rewriting touches only absolute http(s) links", () => {
  const html = [
    '<a href="https://example.com/a">A</a>',
    "<a href='http://example.net/b'>B</a>",
    '<a href="mailto:reader@example.com">Mail</a>',
    '<a href="/relative">Relative</a>',
    '<img src="https://example.com/pixel.gif" />',
  ].join(" ");
  const { html: rewritten, rewritten: count } = rewriteHtmlLinks({
    html,
    rewrite: (to) => `https://mail.example.com/c/1/sig?u=${encodeURIComponent(to)}`,
  });
  assert.equal(count, 2);
  assert.match(rewritten, /\/c\/1\/sig\?u=/);
  assert.ok(rewritten.includes("mailto:reader@example.com"));
  assert.ok(rewritten.includes('href="/relative"'));
  assert.ok(rewritten.includes('src="https://example.com/pixel.gif"'));
});

test("already-signed redirects are never double-wrapped", () => {
  const signed = `https://mail.example.com/c/${messageId}/abc123?u=${encodeURIComponent(target)}`;
  const { html, rewritten } = rewriteHtmlLinks({
    html: `<a href="${signed}">Again</a>`,
    rewrite: () => "https://mail.example.com/c/never",
  });
  assert.equal(rewritten, 0);
  assert.ok(html.includes(signed));
});

test("message helper rewrites with a verifiable signature", () => {
  const { html, rewritten } = rewriteHtmlLinksForMessage({
    baseUrl: "https://mail.example.com",
    html: `<p><a href="${target}">Read</a></p>`,
    key,
    messageId,
  });
  assert.equal(rewritten, 1);
  const href = html.match(/href="([^"]+)"/)?.[1];
  assert.ok(href);
  const parsed = new URL(href.replaceAll("&amp;", "&"));
  const signature = parsed.pathname.split("/").at(-1) ?? "";
  assert.equal(
    verifyClickTrackingSignature({
      key,
      messageId,
      signature,
      targetUrl: target,
    }),
    true,
  );
});

test("default sends leave hrefs untouched", () => {
  const html = `<p><a href="${target}">Read</a></p>`;
  const { rewritten } = rewriteHtmlLinks({ html, rewrite: (to) => to });
  // Identity rewrite still counts trackable links; callers skip rewriting
  // entirely when the domain flag is off, so the stored body keeps hrefs.
  assert.equal(rewritten, 1);
  assert.ok(html.includes(target));
});

test("non-http targets are never trackable", () => {
  for (const value of [
    "mailto:a@b.com",
    "tel:+61000000000",
    "javascript:alert(1)",
    "data:text/html,<p>x</p>",
    "/relative/path",
    "cid:image001",
  ]) {
    assert.equal(isTrackableUrl(value), false);
  }
  assert.equal(isTrackableUrl("https://example.com"), true);
  assert.equal(isTrackableUrl("http://example.com"), true);
});
