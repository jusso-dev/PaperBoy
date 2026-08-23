import { verify, X509Certificate } from "node:crypto";
import { AWS_SES_MAX_EVENT_BYTES } from "@/lib/aws-ses-adapter";

export type AwsSnsEnvelope = {
  Message: string;
  MessageId: string;
  Signature: string;
  SignatureVersion: "1" | "2";
  SigningCertURL: string;
  Subject?: string;
  SubscribeURL?: string;
  Timestamp: string;
  Token?: string;
  TopicArn: string;
  Type:
    | "Notification"
    | "SubscriptionConfirmation"
    | "UnsubscribeConfirmation";
};

export class AwsSnsVerificationError extends Error {
  constructor(
    readonly code:
      | "CERTIFICATE_UNAVAILABLE"
      | "CONFIRMATION_FAILED"
      | "INVALID_MESSAGE"
      | "INVALID_SIGNATURE"
      | "TOPIC_MISMATCH",
  ) {
    super(code);
    this.name = "AwsSnsVerificationError";
  }
}

type Fetch = typeof fetch;
const AWS_SNS_MAX_CERTIFICATE_BYTES = 64 * 1024;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function requiredString(
  value: unknown,
  maximum: number,
): string | null {
  return typeof value === "string" &&
    value.length > 0 &&
    value.length <= maximum &&
    !/[\u0000\r]/.test(value)
    ? value
    : null;
}

export function parseAwsSnsEnvelope(payload: unknown): AwsSnsEnvelope {
  if (!isRecord(payload)) {
    throw new AwsSnsVerificationError("INVALID_MESSAGE");
  }
  const type = requiredString(payload.Type, 64);
  const message = requiredString(payload.Message, AWS_SES_MAX_EVENT_BYTES);
  const messageId = requiredString(payload.MessageId, 128);
  const topicArn = requiredString(payload.TopicArn, 512);
  const timestamp = requiredString(payload.Timestamp, 64);
  const signatureVersion = requiredString(payload.SignatureVersion, 1);
  const signature = requiredString(payload.Signature, 4096);
  const signingCertURL = requiredString(payload.SigningCertURL, 2048);
  if (
    (type !== "Notification" &&
      type !== "SubscriptionConfirmation" &&
      type !== "UnsubscribeConfirmation") ||
    !message ||
    !messageId ||
    !topicArn ||
    !timestamp ||
    (signatureVersion !== "1" && signatureVersion !== "2") ||
    !signature ||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(signature) ||
    !signingCertURL ||
    Number.isNaN(new Date(timestamp).getTime())
  ) {
    throw new AwsSnsVerificationError("INVALID_MESSAGE");
  }
  const subject =
    payload.Subject === undefined
      ? undefined
      : requiredString(payload.Subject, 1000);
  if (payload.Subject !== undefined && !subject) {
    throw new AwsSnsVerificationError("INVALID_MESSAGE");
  }
  const subscribeURL =
    payload.SubscribeURL === undefined
      ? undefined
      : requiredString(payload.SubscribeURL, 2048);
  const token =
    payload.Token === undefined
      ? undefined
      : requiredString(payload.Token, 4096);
  if (
    type !== "Notification" &&
    (!subscribeURL || !token)
  ) {
    throw new AwsSnsVerificationError("INVALID_MESSAGE");
  }
  return {
    Message: message,
    MessageId: messageId,
    Signature: signature,
    SignatureVersion: signatureVersion,
    SigningCertURL: signingCertURL,
    ...(subject ? { Subject: subject } : {}),
    ...(subscribeURL ? { SubscribeURL: subscribeURL } : {}),
    Timestamp: timestamp,
    ...(token ? { Token: token } : {}),
    TopicArn: topicArn,
    Type: type,
  };
}

function topicParts(topicArn: string): {
  hostname: string;
  region: string;
} | null {
  const match =
    /^arn:(aws|aws-cn|aws-us-gov):sns:([a-z0-9-]+):[0-9]{12}:[A-Za-z0-9_-]{1,256}$/.exec(
      topicArn,
    );
  if (!match) return null;
  const [, partition, region] = match;
  return {
    hostname:
      partition === "aws-cn"
        ? `sns.${region}.amazonaws.com.cn`
        : `sns.${region}.amazonaws.com`,
    region,
  };
}

function amazonSnsUrl(value: string, topicArn: string): URL {
  const topic = topicParts(topicArn);
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new AwsSnsVerificationError("INVALID_MESSAGE");
  }
  if (
    !topic ||
    url.protocol !== "https:" ||
    url.hostname.toLowerCase() !== topic.hostname ||
    url.username ||
    url.password ||
    url.hash ||
    url.port
  ) {
    throw new AwsSnsVerificationError("INVALID_MESSAGE");
  }
  return url;
}

async function boundedResponseText(
  response: Response,
  maximumBytes: number,
): Promise<string> {
  const declaredLength = response.headers.get("content-length");
  if (
    declaredLength &&
    /^\d+$/.test(declaredLength) &&
    Number(declaredLength) > maximumBytes
  ) {
    throw new Error("Response is too large.");
  }
  if (!response.body) return "";

  const reader = response.body.getReader();
  const chunks: Buffer[] = [];
  let byteLength = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    byteLength += value.byteLength;
    if (byteLength > maximumBytes) {
      await reader.cancel().catch(() => undefined);
      throw new Error("Response is too large.");
    }
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks, byteLength).toString("utf8");
}

export function awsSnsStringToSign(envelope: AwsSnsEnvelope): string {
  const pairs: [string, string][] =
    envelope.Type === "Notification"
      ? [
          ["Message", envelope.Message],
          ["MessageId", envelope.MessageId],
          ...(envelope.Subject
            ? ([["Subject", envelope.Subject]] as [string, string][])
            : []),
          ["Timestamp", envelope.Timestamp],
          ["TopicArn", envelope.TopicArn],
          ["Type", envelope.Type],
        ]
      : [
          ["Message", envelope.Message],
          ["MessageId", envelope.MessageId],
          ["SubscribeURL", envelope.SubscribeURL ?? ""],
          ["Timestamp", envelope.Timestamp],
          ["Token", envelope.Token ?? ""],
          ["TopicArn", envelope.TopicArn],
          ["Type", envelope.Type],
        ];
  return pairs.flatMap(([name, value]) => [name, value]).join("\n");
}

async function certificate(
  envelope: AwsSnsEnvelope,
  fetcher: Fetch,
): Promise<X509Certificate> {
  const url = amazonSnsUrl(envelope.SigningCertURL, envelope.TopicArn);
  if (!/^\/SimpleNotificationService-[A-Za-z0-9]+\.pem$/.test(url.pathname)) {
    throw new AwsSnsVerificationError("INVALID_MESSAGE");
  }
  let response: Response;
  try {
    response = await fetcher(url, {
      headers: { Accept: "application/x-pem-file,text/plain" },
      redirect: "error",
      signal: AbortSignal.timeout(5000),
    });
  } catch {
    throw new AwsSnsVerificationError("CERTIFICATE_UNAVAILABLE");
  }
  if (!response.ok) {
    throw new AwsSnsVerificationError("CERTIFICATE_UNAVAILABLE");
  }
  let pem: string;
  try {
    pem = await boundedResponseText(response, AWS_SNS_MAX_CERTIFICATE_BYTES);
  } catch {
    throw new AwsSnsVerificationError("CERTIFICATE_UNAVAILABLE");
  }
  try {
    return new X509Certificate(pem);
  } catch {
    throw new AwsSnsVerificationError("CERTIFICATE_UNAVAILABLE");
  }
}

export async function verifyAwsSnsEnvelope(input: {
  expectedTopicArn: string;
  fetcher?: Fetch;
  payload: unknown;
}): Promise<AwsSnsEnvelope> {
  const envelope = parseAwsSnsEnvelope(input.payload);
  if (envelope.TopicArn !== input.expectedTopicArn) {
    throw new AwsSnsVerificationError("TOPIC_MISMATCH");
  }
  const cert = await certificate(envelope, input.fetcher ?? fetch);
  const valid = verify(
    envelope.SignatureVersion === "2" ? "RSA-SHA256" : "RSA-SHA1",
    Buffer.from(awsSnsStringToSign(envelope), "utf8"),
    cert.publicKey,
    Buffer.from(envelope.Signature, "base64"),
  );
  if (!valid) {
    throw new AwsSnsVerificationError("INVALID_SIGNATURE");
  }
  return envelope;
}

export async function confirmAwsSnsSubscription(input: {
  envelope: AwsSnsEnvelope;
  fetcher?: Fetch;
}): Promise<void> {
  const subscribeURL = input.envelope.SubscribeURL;
  if (
    input.envelope.Type !== "SubscriptionConfirmation" ||
    !subscribeURL ||
    !input.envelope.Token
  ) {
    throw new AwsSnsVerificationError("INVALID_MESSAGE");
  }
  const url = amazonSnsUrl(subscribeURL, input.envelope.TopicArn);
  if (
    url.searchParams.get("Action") !== "ConfirmSubscription" ||
    url.searchParams.get("TopicArn") !== input.envelope.TopicArn ||
    url.searchParams.get("Token") !== input.envelope.Token
  ) {
    throw new AwsSnsVerificationError("INVALID_MESSAGE");
  }
  try {
    const response = await (input.fetcher ?? fetch)(url, {
      redirect: "error",
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) {
      throw new Error("Confirmation failed");
    }
  } catch {
    throw new AwsSnsVerificationError("CONFIRMATION_FAILED");
  }
}
