export const MESSAGE_EVENT_TYPES = [
  "queued",
  "delivered",
  "deferred",
  "bounced",
  "complained",
  "opened",
  "clicked",
] as const;

export type MessageEventType = (typeof MESSAGE_EVENT_TYPES)[number];

export type MessageEventRecord = {
  createdAt: Date;
  data: Record<string, unknown>;
  id: string;
  messageId: string;
  sequence: number;
  type: MessageEventType;
};

export class MessageEventError extends Error {
  constructor(
    readonly code: "OPEN_TRACKING_DISABLED" | "CLICK_TRACKING_DISABLED",
  ) {
    super(code);
    this.name = "MessageEventError";
  }
}

export function requireMessageEventAllowed(input: {
  clickTrackingEnabled?: boolean;
  openTrackingEnabled: boolean;
  type: MessageEventType;
}): void {
  if (input.type === "opened" && !input.openTrackingEnabled) {
    throw new MessageEventError("OPEN_TRACKING_DISABLED");
  }
  if (input.type === "clicked" && !input.clickTrackingEnabled) {
    throw new MessageEventError("CLICK_TRACKING_DISABLED");
  }
}
