import MailComposer from "nodemailer/lib/mail-composer";

export const CLOUDFLARE_EMAIL_MAX_BYTES = 5 * 1024 * 1024;

export type DeliveryAttachment = {
  content: Buffer;
  contentType: string;
  filename: string;
};

export type DeliveryMessage = {
  attachments: DeliveryAttachment[];
  from: string;
  html: string | null;
  subject: string;
  text: string | null;
  to: string[];
};

export class DeliveryProviderError extends Error {
  constructor(readonly code: "MESSAGE_TOO_LARGE") {
    super(code);
    this.name = "DeliveryProviderError";
  }
}

export async function buildSmtpMimeMessage(
  message: DeliveryMessage & {
    date?: Date;
    messageId?: string;
  },
): Promise<Buffer> {
  const composer = new MailComposer({
    attachments: message.attachments.map((attachment) => ({
      content: attachment.content,
      contentDisposition: "attachment",
      contentType: attachment.contentType,
      filename: attachment.filename,
    })),
    date: message.date,
    disableFileAccess: true,
    disableUrlAccess: true,
    from: message.from,
    html: message.html ?? undefined,
    messageId: message.messageId,
    subject: message.subject,
    text: message.text ?? undefined,
    to: message.to,
  });

  return composer.compile().build();
}

export function prepareCloudflareEmailMessage(message: DeliveryMessage) {
  const payload = {
    attachments: message.attachments.map((attachment) => ({
      content: attachment.content.toString("base64"),
      disposition: "attachment" as const,
      filename: attachment.filename,
      type: attachment.contentType,
    })),
    from: message.from,
    ...(message.html === null ? {} : { html: message.html }),
    subject: message.subject,
    ...(message.text === null ? {} : { text: message.text }),
    to: message.to,
  };

  if (
    Buffer.byteLength(JSON.stringify(payload), "utf8") >
    CLOUDFLARE_EMAIL_MAX_BYTES
  ) {
    throw new DeliveryProviderError("MESSAGE_TOO_LARGE");
  }

  return payload;
}
