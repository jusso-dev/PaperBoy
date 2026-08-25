import {
  renderTemplate,
  templateSampleData,
} from "@/lib/template-core";

export type BroadcastTestSendState = {
  error: string | null;
  queuedId: string | null;
};

type BroadcastTestSnapshot = {
  from: string;
  id: string;
  templateHtml: string | null;
  templateRequiredVariables: readonly string[];
  templateSubject: string;
  templateText: string | null;
};

type BroadcastTestQueue = (input: {
  allowAttachments?: boolean;
  payload: unknown;
  principal: {
    actorUserId: string;
    apiKeyId: null;
    environment: "live";
    orgId: string;
  };
}) => Promise<{ id: string }>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function optionalOverride(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  return value.trim().length > 0 ? value : undefined;
}

function broadcastTestTemplateData(input: {
  html: string | null;
  subject: string;
  text: string | null;
  to: string;
}): Record<string, unknown> {
  const sample = templateSampleData({
    html: input.html,
    subject: input.subject,
    text: input.text,
  });
  const contact = isRecord(sample.contact) ? sample.contact : {};
  return {
    ...sample,
    contact: {
      ...contact,
      email: input.to,
      name:
        typeof contact.name === "string" && contact.name.length > 0
          ? contact.name
          : input.to,
    },
    email: input.to,
    name: input.to,
    unsubscribe_url: "https://paperboy.example/unsubscribe?broadcast_test=1",
  };
}

export async function queueBroadcastTestEmail(
  input: {
    actorUserId: string;
    broadcastId: string;
    from?: unknown;
    html?: unknown;
    orgId: string;
    subject?: unknown;
    text?: unknown;
    to: unknown;
  },
  dependencies: {
    authorize: (value: {
      actorUserId: string;
      orgId: string;
    }) => Promise<void>;
    loadBroadcast: (value: {
      actorUserId: string | null;
      broadcastId: string;
      orgId: string;
    }) => Promise<BroadcastTestSnapshot>;
    queue: BroadcastTestQueue;
  },
): Promise<{ id: string }> {
  await dependencies.authorize(input);
  const broadcast = await dependencies.loadBroadcast({
    actorUserId: input.actorUserId,
    broadcastId: input.broadcastId,
    orgId: input.orgId,
  });

  const from = optionalOverride(input.from) ?? broadcast.from;
  const subject = optionalOverride(input.subject) ?? broadcast.templateSubject;
  const html =
    typeof input.html === "string"
      ? input.html.trim().length > 0
        ? input.html
        : null
      : broadcast.templateHtml;
  const text =
    typeof input.text === "string"
      ? input.text.trim().length > 0
        ? input.text
        : null
      : broadcast.templateText;
  const to = typeof input.to === "string" ? input.to.trim() : "";
  const rendered = renderTemplate(
    {
      html,
      requiredVariables: broadcast.templateRequiredVariables,
      subject,
      text,
    },
    broadcastTestTemplateData({ html, subject, text, to }),
  );

  return dependencies.queue({
    allowAttachments: false,
    payload: {
      from,
      ...(rendered.html === null ? {} : { html: rendered.html }),
      subject: rendered.subject,
      tags: [
        { name: "broadcast_id", value: broadcast.id },
        { name: "broadcast_test", value: "1" },
      ],
      ...(rendered.text === null ? {} : { text: rendered.text }),
      to,
    },
    principal: {
      actorUserId: input.actorUserId,
      apiKeyId: null,
      environment: "live",
      orgId: input.orgId,
    },
  });
}
