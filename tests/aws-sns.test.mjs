import assert from "node:assert/strict";
import test from "node:test";
import {
  AwsSnsVerificationError,
  awsSnsStringToSign,
  parseAwsSnsEnvelope,
  verifyAwsSnsEnvelope,
} from "../src/lib/aws-sns.ts";

const payload = {
  Type: "Notification",
  MessageId: "11111111-1111-4111-8111-111111111111",
  TopicArn: "arn:aws:sns:us-east-1:123456789012:paperboy-ses-events",
  Subject: "SES event",
  Message: "{\"eventType\":\"Delivery\"}",
  Timestamp: "2026-08-24T01:02:03.000Z",
  SignatureVersion: "2",
  Signature: "ZmFrZS1zaWduYXR1cmU=",
  SigningCertURL:
    "https://sns.us-east-1.amazonaws.com/SimpleNotificationService-0123456789abcdef.pem",
};
const certificate = `-----BEGIN CERTIFICATE-----
MIICxDCCAawCCQC1OlJVBM463zANBgkqhkiG9w0BAQsFADAkMSIwIAYDVQQDDBlw
YXBlcmJveS1zbnMtdGVzdC5pbnZhbGlkMB4XDTI2MDgyMzIzNTE1OVoXDTM2MDgy
MDIzNTE1OVowJDEiMCAGA1UEAwwZcGFwZXJib3ktc25zLXRlc3QuaW52YWxpZDCC
ASIwDQYJKoZIhvcNAQEBBQADggEPADCCAQoCggEBAJntCH93j6Vyhw94o7UiWeJa
FJ8+/KUlHCRNMRwj1/VMc54SeVyRhNnVoTBkfu96CKULP+gSSpIbniBliJtjMk0z
4MYEu0pb/l31UcxkIHMAIT8UH6aeBAuMXnS+2S6sBHWQA0VlH8Hdk1xVs3T8NR7c
bgqd+gE2BvDbwomkwpowNy0I6m2ojK41fKxFB707iI6+TOfthc0GWmED7VBTx09a
0vMHH2FI1rEYr/FQdeefXgVQ8zMXvAtyDRJ1g2whgWDRWB3/TveIVAzPnK84IbEi
vUCOgHZJgi76fWqe6NkG1IYTgNVAEgKLpRLTIl5Jx/pUccgSIZkOez8YX7wgeFMC
AwEAATANBgkqhkiG9w0BAQsFAAOCAQEAWB7b+63lUXYc2dLYX+/rSPzY4r/+Y6lA
q7UZHFnDROoDu121SeRLZO+gWIFnANF4NM3mE6dxDpeAN4F+OlZEaP0cjypvtUP5
xwaHrws+i/JYLrT4lXq1fStCzAJFqIO2dNSex54fsRna2d2zoPVOpdW8ORr3UJmN
DppdhB82fmg7un3DyDu4CYlfMWoABLFfs4fFfqcceZqD1D6VtW1cc9zIP++OhK1m
VNaS8YIg4nyL7UtsZOJuhkZwZykcF0Mr2CVbVl+nF7NPOdRnfexEmYEkp9Bv8mq1
7JxkBBpEr9wjBDNDV96+F3kv2bHl03KT4o+kEqMOXc52hPFLAxq0bw==
-----END CERTIFICATE-----`;

test("SNS canonical signing input uses the documented fields and no trailing newline", () => {
  const envelope = parseAwsSnsEnvelope(payload);
  assert.equal(
    awsSnsStringToSign(envelope),
    [
      "Message",
      payload.Message,
      "MessageId",
      payload.MessageId,
      "Subject",
      payload.Subject,
      "Timestamp",
      payload.Timestamp,
      "TopicArn",
      payload.TopicArn,
      "Type",
      payload.Type,
    ].join("\n"),
  );
  assert.equal(awsSnsStringToSign(envelope).endsWith("\n"), false);
});

test("SNS verification rejects an unexpected topic before fetching a certificate", async () => {
  let fetched = false;
  await assert.rejects(
    () =>
      verifyAwsSnsEnvelope({
        expectedTopicArn:
          "arn:aws:sns:us-east-1:123456789012:different-topic",
        fetcher: async () => {
          fetched = true;
          throw new Error("must not fetch");
        },
        payload,
      }),
    (error) =>
      error instanceof AwsSnsVerificationError &&
      error.code === "TOPIC_MISMATCH",
  );
  assert.equal(fetched, false);
});

test("SNS verification accepts a fixture whose canonical bytes match its X.509 signature", async () => {
  const signedPayload = {
    ...payload,
    Signature:
      "dyKhN56pUXKsEPl1KqvkYsuLUzDovCQbYU6leVess9ZjYxFJm/JisrJu+Me+1xYxjJ7FT0+PQ505NyTtrn8hCKo/iZUFB5aD0CZU9kFTRfWc/HvN+IFLR4KmgM8FSwdxnJEB+SjLgHE4me+afpYi0mMg+cY92J1T0+e5yylCV0If+tUIoiRhApmh6SO3F73CEKTuSSICTHGSnYvUIzSRSLhL9k83qfmQ1RC3dvurhvr8vdlNlTH7dg9Z/Pr0+XWgDLRnZoGfY+l1BWyzv/ftACjESupDidb9TzmxoT4v2Jh4qUBdbrpMOTHqc9sbfXdK2ADQfbPp1Qy5R+5//Y0KDw==",
  };
  assert.equal(
    (
      await verifyAwsSnsEnvelope({
        expectedTopicArn: payload.TopicArn,
        fetcher: async () => new Response(certificate),
        payload: signedPayload,
      })
    ).MessageId,
    payload.MessageId,
  );
});

test("SNS verification bounds the AWS certificate response before parsing", async () => {
  await assert.rejects(
    () =>
      verifyAwsSnsEnvelope({
        expectedTopicArn: payload.TopicArn,
        fetcher: async () =>
          new Response("oversized", {
            headers: { "Content-Length": String(64 * 1024 + 1) },
          }),
        payload,
      }),
    (error) =>
      error instanceof AwsSnsVerificationError &&
      error.code === "CERTIFICATE_UNAVAILABLE",
  );
});
