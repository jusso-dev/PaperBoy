import { createHash } from "node:crypto";
import {
  GetAccountCommand,
  SendBulkEmailCommand,
  SendEmailCommand,
  SESv2Client,
  type BulkEmailEntryResult,
  type SendBulkEmailCommandOutput,
  type SendEmailCommandOutput,
} from "@aws-sdk/client-sesv2";
import { fromTemporaryCredentials } from "@aws-sdk/credential-providers";
import { buildSmtpMimeMessage } from "@/lib/email-delivery";
import { normalizeEmailAddress } from "@/lib/email-core";
import type { ProviderAwsSesConfiguration } from "@/lib/outbound-provider-configuration";
import {
  defineOutboundProviderAdapter,
  OUTBOUND_PROVIDER_CATALOG,
  type OutboundDeliveryMessage,
  type OutboundProviderAdapter,
  type OutboundProviderEvent,
} from "@/lib/outbound-provider-core";
import { OutboundDeliveryError } from "@/lib/worker-core";

export const AWS_SES_MAX_BULK_ENTRIES = 50;
export const AWS_SES_MAX_EVENT_BYTES = 512 * 1024;
export const AWS_SES_MESSAGE_ID_TAG = "paperboy_message_id";

type AwsSesCommand =
  | GetAccountCommand
  | SendBulkEmailCommand
  | SendEmailCommand;

export type AwsSesClient = {
  destroy?: () => void;
  send: (command: AwsSesCommand) => Promise<unknown>;
};

type AwsSesAdapterInput = {
  client?: AwsSesClient;
  configuration: ProviderAwsSesConfiguration;
  now?: () => Date;
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TRANSIENT_BULK_STATUSES = new Set([
  "ACCOUNT_DAILY_QUOTA_EXCEEDED",
  "ACCOUNT_THROTTLED",
  "TRANSIENT_FAILURE",
]);
const TRANSIENT_ERROR_NAMES = new Set([
  "InternalServiceError",
  "ServiceUnavailableException",
  "ThrottlingException",
  "TimeoutError",
  "TooManyRequestsException",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function safeProviderMessageId(value: unknown): string | null {
  return typeof value === "string" &&
    value.length > 0 &&
    value.length <= 1000 &&
    !/[\u0000-\u001f\u007f]/.test(value)
    ? value
    : null;
}

function safeProviderValue(value: unknown): string | null {
  return typeof value === "string" &&
    value.length > 0 &&
    value.length <= 128 &&
    /^[A-Za-z0-9 _./:-]+$/.test(value)
    ? value
    : null;
}

function normalizedRecipients(message: OutboundDeliveryMessage): string[] {
  const recipients = message.to.map(normalizeEmailAddress);
  if (recipients.some((recipient) => !recipient)) {
    throw new OutboundDeliveryError({
      code: "invalid_envelope",
      reason: "The queued Amazon SES envelope is invalid.",
      retryable: false,
    });
  }
  return recipients as string[];
}

function requireSesMessage(message: OutboundDeliveryMessage): void {
  if (message.deliveryMode !== "live" || message.provider !== "aws-ses") {
    throw new OutboundDeliveryError({
      code: "adapter_mode_mismatch",
      reason: "The Amazon SES adapter accepts only selected live SES messages.",
      retryable: false,
    });
  }
}

function sesError(error: unknown): OutboundDeliveryError {
  if (error instanceof OutboundDeliveryError) return error;
  if (error && typeof error === "object") {
    const candidate = error as {
      $metadata?: { httpStatusCode?: unknown };
      name?: unknown;
    };
    const status = candidate.$metadata?.httpStatusCode;
    const name = typeof candidate.name === "string" ? candidate.name : "";
    const retryable =
      TRANSIENT_ERROR_NAMES.has(name) ||
      status === 429 ||
      (typeof status === "number" && status >= 500);
    return new OutboundDeliveryError({
      code: retryable ? "aws_ses_temporary_error" : "aws_ses_rejected",
      reason: retryable
        ? "Amazon SES could not accept the message temporarily."
        : "Amazon SES rejected the configured sender, message, or credentials.",
      retryable,
    });
  }
  return new OutboundDeliveryError({
    code: "aws_ses_connection_error",
    reason: "Amazon SES could not be reached before delivery completed.",
    retryable: true,
  });
}

function attachmentFingerprint(message: OutboundDeliveryMessage): string {
  const hash = createHash("sha256");
  for (const attachment of message.attachments) {
    hash.update(attachment.filename);
    hash.update("\0");
    hash.update(attachment.contentType);
    hash.update("\0");
    hash.update(attachment.content);
    hash.update("\0");
  }
  return hash.digest("hex");
}

function bulkCompatibility(messages: OutboundDeliveryMessage[]): void {
  if (messages.length < 1 || messages.length > AWS_SES_MAX_BULK_ENTRIES) {
    throw new OutboundDeliveryError({
      code: "aws_ses_invalid_batch",
      reason: `Amazon SES bulk sends require 1-${AWS_SES_MAX_BULK_ENTRIES} entries.`,
      retryable: false,
    });
  }
  const first = messages[0];
  const attachmentKey = attachmentFingerprint(first);
  for (const message of messages) {
    requireSesMessage(message);
    normalizedRecipients(message);
    if (
      message.from !== first.from ||
      Boolean(message.html) !== Boolean(first.html) ||
      Boolean(message.text) !== Boolean(first.text) ||
      attachmentFingerprint(message) !== attachmentKey
    ) {
      throw new OutboundDeliveryError({
        code: "aws_ses_incompatible_batch",
        reason:
          "Amazon SES bulk entries must share one sender, body format, and attachment set.",
        retryable: false,
      });
    }
  }
}

function clientFor(configuration: ProviderAwsSesConfiguration): AwsSesClient {
  const credentials =
    configuration.credentials.kind === "access-key"
      ? configuration.credentials.credentials
      : configuration.credentials.kind === "assume-role"
        ? fromTemporaryCredentials({
            clientConfig: { region: configuration.region },
            ...(configuration.credentials.sourceCredentials
              ? {
                  masterCredentials:
                    configuration.credentials.sourceCredentials,
                }
              : {}),
            params: {
              ...(configuration.credentials.externalId
                ? { ExternalId: configuration.credentials.externalId }
                : {}),
              RoleArn: configuration.credentials.roleArn,
              RoleSessionName: "paperboy-ses",
            },
          })
        : undefined;
  return new SESv2Client({
    ...(credentials ? { credentials } : {}),
    region: configuration.region,
  }) as AwsSesClient;
}

function parseOccurredAt(value: unknown, fallback: Date): Date {
  if (
    typeof value !== "string" ||
    value.length > 64 ||
    !/(?:Z|[+-][0-9]{2}:[0-9]{2})$/.test(value)
  ) {
    return fallback;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? fallback : date;
}

function eventEnvelope(payload: unknown): {
  event: Record<string, unknown>;
  eventTypeOverride: string | null;
  providerEventId: string | null;
} {
  if (!isRecord(payload)) {
    throw new TypeError("Amazon SES provider events must be JSON objects.");
  }
  if (payload.Type === "Notification") {
    if (
      typeof payload.Message !== "string" ||
      payload.Message.length === 0 ||
      Buffer.byteLength(payload.Message, "utf8") > AWS_SES_MAX_EVENT_BYTES
    ) {
      throw new TypeError("Amazon SNS notification content is invalid.");
    }
    let event: unknown;
    try {
      event = JSON.parse(payload.Message);
    } catch {
      throw new TypeError("Amazon SNS notification content is not JSON.");
    }
    if (!isRecord(event)) {
      throw new TypeError("Amazon SNS notification content is invalid.");
    }
    return {
      event,
      eventTypeOverride: null,
      providerEventId: safeProviderMessageId(payload.MessageId),
    };
  }
  if (payload.source === "aws.ses" && isRecord(payload.detail)) {
    const eventBridgeTypes: Record<string, string> = {
      "Email Bounced": "Bounce",
      "Email Complaint Received": "Complaint",
      "Email Delivered": "Delivery",
      "Email Delivery Delayed": "DeliveryDelay",
    };
    const detailType =
      typeof payload["detail-type"] === "string"
        ? payload["detail-type"]
        : "";
    return {
      event: payload.detail,
      eventTypeOverride: eventBridgeTypes[detailType] ?? null,
      providerEventId: safeProviderMessageId(payload.id),
    };
  }
  return { event: payload, eventTypeOverride: null, providerEventId: null };
}

function tagValue(tags: unknown, name: string): string | null {
  if (!isRecord(tags)) return null;
  const value = tags[name];
  if (typeof value === "string") return value;
  return Array.isArray(value) && typeof value[0] === "string"
    ? value[0]
    : null;
}

function eventRecipients(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [
    ...new Set(
      value.flatMap((entry) => {
        if (!isRecord(entry)) return [];
        const normalized = normalizeEmailAddress(entry.emailAddress);
        return normalized ? [normalized] : [];
      }),
    ),
  ];
}

function directProviderEventId(
  event: Record<string, unknown>,
  detail: Record<string, unknown> | null,
): string {
  const explicit = safeProviderMessageId(detail?.feedbackId);
  if (explicit) return explicit;
  let encoded: string;
  try {
    encoded = JSON.stringify(event);
  } catch {
    throw new TypeError("Amazon SES provider event is not serializable.");
  }
  if (Buffer.byteLength(encoded, "utf8") > AWS_SES_MAX_EVENT_BYTES) {
    throw new TypeError("Amazon SES provider event is too large.");
  }
  return createHash("sha256").update(encoded).digest("hex");
}

export function mapAwsSesEvent(input: {
  payload: unknown;
  receivedAt: Date;
}): OutboundProviderEvent[] {
  const envelope = eventEnvelope(input.payload);
  const event = envelope.event;
  const mail = event.mail;
  if (!isRecord(mail)) {
    throw new TypeError("Amazon SES provider event mail metadata is invalid.");
  }
  const eventType =
    (typeof event.eventType === "string" ? event.eventType : null) ??
    (typeof event.notificationType === "string"
      ? event.notificationType
      : null) ??
    envelope.eventTypeOverride;
  const mapping = {
    Bounce: "bounced",
    Complaint: "complained",
    Delivery: "delivered",
    DeliveryDelay: "deferred",
  } as const;
  if (!eventType || !Object.hasOwn(mapping, eventType)) return [];

  const providerMessageId = safeProviderMessageId(mail.messageId);
  if (!providerMessageId) {
    throw new TypeError("Amazon SES provider message ID is invalid.");
  }
  const messageIdCandidate =
    tagValue(mail.tags, AWS_SES_MESSAGE_ID_TAG) ??
    tagValue(event.tags, AWS_SES_MESSAGE_ID_TAG);
  const messageId =
    messageIdCandidate && UUID_PATTERN.test(messageIdCandidate)
      ? messageIdCandidate.toLowerCase()
      : null;
  const detailName =
    eventType === "Bounce"
      ? "bounce"
      : eventType === "Complaint"
        ? "complaint"
        : eventType === "Delivery"
          ? "delivery"
          : "deliveryDelay";
  const detail = isRecord(event[detailName]) ? event[detailName] : null;
  const occurredAt = parseOccurredAt(
    detail?.timestamp ?? mail.timestamp,
    input.receivedAt,
  );
  const data: Record<string, unknown> = {
    provider: "aws-ses",
    provider_event: eventType,
  };
  const bounceType = safeProviderValue(detail?.bounceType);
  const bounceSubType = safeProviderValue(detail?.bounceSubType);
  const delayType = safeProviderValue(detail?.delayType);
  if (bounceType) data.bounce_type = bounceType;
  if (bounceSubType) data.bounce_subtype = bounceSubType;
  if (delayType) data.delay_type = delayType;

  const suppressionRecipients =
    eventType === "Complaint"
      ? eventRecipients(detail?.complainedRecipients)
      : eventType === "Bounce" && detail?.bounceType === "Permanent"
        ? eventRecipients(detail.bouncedRecipients)
        : [];
  const reason = eventType === "Complaint" ? "complained" : "bounced";

  return [
    {
      data,
      messageId,
      occurredAt,
      providerEventId:
        envelope.providerEventId ?? directProviderEventId(event, detail),
      providerMessageId,
      ...(suppressionRecipients.length > 0
        ? {
            suppressions: suppressionRecipients.map((email) => ({
              email,
              reason,
            })),
          }
        : {}),
      type: mapping[eventType as keyof typeof mapping],
    },
  ];
}

function bulkFailure(results: BulkEmailEntryResult[]): OutboundDeliveryError {
  const failed = results.filter((result) => result.Status !== "SUCCESS");
  const partial = failed.length !== results.length;
  const retryable =
    !partial &&
    failed.length > 0 &&
    failed.every(
      (result) =>
        typeof result.Status === "string" &&
        TRANSIENT_BULK_STATUSES.has(result.Status),
    );
  return new OutboundDeliveryError({
    code: partial ? "aws_ses_partial_bulk_failure" : "aws_ses_bulk_rejected",
    reason: partial
      ? "Amazon SES accepted only part of the bulk request; PaperBoy will not replay successful entries."
      : "Amazon SES rejected the bulk request entries.",
    retryable,
  });
}

export function createAwsSesAdapter(
  input: AwsSesAdapterInput,
): OutboundProviderAdapter & { close: () => void } {
  const client = input.client ?? clientFor(input.configuration);
  const now = input.now ?? (() => new Date());
  const configurationSet = input.configuration.configurationSetName;

  return defineOutboundProviderAdapter({
    capabilities: OUTBOUND_PROVIDER_CATALOG["aws-ses"].capabilities,
    close() {
      client.destroy?.();
    },
    async mapEvent(eventInput) {
      return mapAwsSesEvent(eventInput);
    },
    provider: "aws-ses",
    async send(message) {
      requireSesMessage(message);
      const to = normalizedRecipients(message);
      const envelopeFrom = normalizeEmailAddress(message.from);
      if (!envelopeFrom) {
        throw new OutboundDeliveryError({
          code: "invalid_envelope",
          reason: "The queued Amazon SES envelope is invalid.",
          retryable: false,
        });
      }
      const senderDomain = envelopeFrom.slice(envelopeFrom.lastIndexOf("@") + 1);
      const raw = await buildSmtpMimeMessage({
        ...message,
        date: now(),
        headers: { "X-PaperBoy-Message-ID": message.id },
        messageId: `<${message.id}@${senderDomain}>`,
      });
      try {
        const output = (await client.send(
          new SendEmailCommand({
            ...(configurationSet
              ? { ConfigurationSetName: configurationSet }
              : {}),
            Content: { Raw: { Data: raw } },
            Destination: { ToAddresses: to },
            EmailTags: [
              { Name: AWS_SES_MESSAGE_ID_TAG, Value: message.id },
            ],
            FromEmailAddress: message.from,
          }),
        )) as SendEmailCommandOutput;
        const providerMessageId = safeProviderMessageId(output.MessageId);
        if (!providerMessageId) {
          throw new OutboundDeliveryError({
            code: "aws_ses_invalid_response",
            reason: "Amazon SES accepted the request without a usable message ID.",
            retryable: true,
          });
        }
        return { providerMessageId };
      } catch (error) {
        throw sesError(error);
      }
    },
    async sendBatch(messages) {
      bulkCompatibility(messages);
      const first = messages[0];
      const templateData = (message: OutboundDeliveryMessage) =>
        JSON.stringify({
          ...(message.html === null ? {} : { pb_html: message.html }),
          pb_subject: message.subject,
          ...(message.text === null ? {} : { pb_text: message.text }),
        });
      try {
        const output = (await client.send(
          new SendBulkEmailCommand({
            BulkEmailEntries: messages.map((message) => ({
              Destination: { ToAddresses: normalizedRecipients(message) },
              ReplacementEmailContent: {
                ReplacementTemplate: {
                  ReplacementTemplateData: templateData(message),
                },
              },
              ReplacementHeaders: [
                { Name: "X-PaperBoy-Message-ID", Value: message.id },
              ],
              ReplacementTags: [
                { Name: AWS_SES_MESSAGE_ID_TAG, Value: message.id },
              ],
            })),
            ...(configurationSet
              ? { ConfigurationSetName: configurationSet }
              : {}),
            DefaultContent: {
              Template: {
                Attachments: first.attachments.map((attachment) => ({
                  ContentDisposition: "ATTACHMENT",
                  ContentTransferEncoding: "BASE64",
                  ContentType: attachment.contentType,
                  FileName: attachment.filename,
                  RawContent: attachment.content,
                })),
                TemplateContent: {
                  ...(first.html === null ? {} : { Html: "{{pb_html}}" }),
                  Subject: "{{pb_subject}}",
                  ...(first.text === null ? {} : { Text: "{{pb_text}}" }),
                },
                TemplateData: templateData(first),
              },
            },
            FromEmailAddress: first.from,
          }),
        )) as SendBulkEmailCommandOutput;
        const results = output.BulkEmailEntryResults ?? [];
        if (
          results.length !== messages.length ||
          results.some((result) => result.Status !== "SUCCESS")
        ) {
          throw bulkFailure(results);
        }
        return results.map((result) => {
          const providerMessageId = safeProviderMessageId(result.MessageId);
          if (!providerMessageId) {
            throw new OutboundDeliveryError({
              code: "aws_ses_invalid_response",
              reason:
                "Amazon SES accepted a bulk entry without a usable message ID.",
              retryable: false,
            });
          }
          return { providerMessageId };
        });
      } catch (error) {
        throw sesError(error);
      }
    },
    async testConnection() {
      try {
        const output = (await client.send(new GetAccountCommand({}))) as {
          ProductionAccessEnabled?: boolean;
          SendingEnabled?: boolean;
        };
        return {
          accountMode:
            output.ProductionAccessEnabled === true ? "production" : "sandbox",
          region: input.configuration.region,
          sendingEnabled: output.SendingEnabled === true,
        };
      } catch (error) {
        throw sesError(error);
      }
    },
  });
}
