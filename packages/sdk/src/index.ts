export type PaperBoyEnvironment = "live" | "test";
export type PaperBoyDeliveryMode = "live" | "test-sink";
export type PaperBoyMessageStatus = "queued" | "sending" | "sent" | "failed";
export type PaperBoyOutboundProvider =
  | "smtp"
  | "cloudflare-email"
  | "aws-ses"
  | "azure-email"
  | "test-sink";

export type EmailTag = {
  name: string;
  value: string;
};

export type EmailAttachment = {
  content: string;
  content_type: string;
  filename: string;
};

type SendEmailEnvelope = {
  attachments?: EmailAttachment[];
  from: string;
  tags?: EmailTag[];
  to: string | string[];
};

export type SendInlineEmailInput = SendEmailEnvelope & {
  data?: never;
  html?: string;
  subject: string;
  template_id?: never;
  text?: string;
};

export type SendTemplateEmailInput = SendEmailEnvelope & {
  data?: Record<string, unknown>;
  html?: never;
  subject?: never;
  template_id: string;
  text?: never;
};

export type SendEmailInput = SendInlineEmailInput | SendTemplateEmailInput;

export type SendEmailOptions = {
  /** API-key-scoped for 24 hours; replays do not reach the outbound provider. */
  idempotencyKey?: string;
};

export type QueuedEmail = {
  id: string;
};

export type StoredAttachment = {
  content_type: string;
  filename: string;
  id: string;
  size: number;
};

export type Email = {
  attachments: StoredAttachment[];
  attempt_count: number;
  created_at: string;
  delivery_mode: PaperBoyDeliveryMode;
  domain_id: string | null;
  environment: PaperBoyEnvironment;
  failed_at: string | null;
  failure_reason: string | null;
  from: string;
  html: string | null;
  id: string;
  last_attempt_at: string | null;
  last_error_code: string | null;
  next_attempt_at: string | null;
  object: "email";
  open_tracking_enabled: boolean;
  click_tracking_enabled: boolean;
  provider: PaperBoyOutboundProvider;
  sent_at: string | null;
  status: PaperBoyMessageStatus;
  subject: string;
  tags: EmailTag[];
  text: string | null;
  to: string[];
  updated_at: string;
};

type FetchResponse = {
  ok: boolean;
  status: number;
  text: () => Promise<string>;
};

type FetchRequest = {
  body?: string;
  headers: Record<string, string>;
  method: "GET" | "POST";
};

export type PaperBoyFetch = (
  url: string,
  request: FetchRequest,
) => Promise<FetchResponse>;

export type PaperBoyClientOptions = {
  apiKey: string;
  baseUrl: string;
  fetch?: PaperBoyFetch;
};

type PaperBoyErrorOptions = {
  code: string;
  message: string;
  retryAfterSeconds?: number;
  status: number;
};

export class PaperBoyError extends Error {
  readonly code: string;
  readonly retryAfterSeconds: number | null;
  readonly status: number;

  constructor(options: PaperBoyErrorOptions) {
    super(options.message);
    this.name = "PaperBoyError";
    this.code = options.code;
    this.retryAfterSeconds = options.retryAfterSeconds ?? null;
    this.status = options.status;
  }
}

function object(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function endpointBase(value: string): string {
  let url: URL;

  try {
    url = new URL(value);
  } catch {
    throw new TypeError("PaperBoy baseUrl must be an absolute HTTP(S) URL.");
  }

  if (
    (url.protocol !== "http:" && url.protocol !== "https:") ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    throw new TypeError(
      "PaperBoy baseUrl must be an HTTP(S) URL without credentials, query, or fragment.",
    );
  }

  return `${url.toString().replace(/\/+$/, "")}/`;
}

function parseBody(text: string): unknown {
  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function responseError(status: number, body: unknown): PaperBoyError {
  const error = object(body) && object(body.error) ? body.error : null;
  const code = typeof error?.code === "string" ? error.code : "request_failed";
  const message =
    typeof error?.message === "string"
      ? error.message
      : `PaperBoy request failed with HTTP ${status}.`;
  const retryAfterSeconds =
    typeof error?.retry_after_seconds === "number"
      ? error.retry_after_seconds
      : undefined;

  return new PaperBoyError({ code, message, retryAfterSeconds, status });
}

export class PaperBoy {
  readonly #apiKey: string;
  readonly #baseUrl: string;
  readonly #fetch: PaperBoyFetch;

  constructor(options: PaperBoyClientOptions) {
    if (!options.apiKey || options.apiKey.trim() !== options.apiKey) {
      throw new TypeError("PaperBoy apiKey must be a non-empty unpadded string.");
    }

    this.#apiKey = options.apiKey;
    this.#baseUrl = endpointBase(options.baseUrl);
    this.#fetch =
      options.fetch ??
      ((url, request) => globalThis.fetch(url, request) as Promise<FetchResponse>);
  }

  async #request<T>(path: string, request: Omit<FetchRequest, "headers"> & {
    headers?: Record<string, string>;
  }): Promise<T> {
    let response: FetchResponse;

    try {
      response = await this.#fetch(new URL(path, this.#baseUrl).toString(), {
        ...request,
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${this.#apiKey}`,
          ...request.headers,
        },
      });
    } catch {
      throw new PaperBoyError({
        code: "network_error",
        message: "PaperBoy could not be reached.",
        status: 0,
      });
    }

    const body = parseBody(await response.text());

    if (!response.ok) throw responseError(response.status, body);
    if (!object(body)) {
      throw new PaperBoyError({
        code: "invalid_response",
        message: "PaperBoy returned an invalid JSON response.",
        status: response.status,
      });
    }

    return body as T;
  }

  send(input: SendEmailInput, options: SendEmailOptions = {}): Promise<QueuedEmail> {
    return this.#request<QueuedEmail>("api/v1/emails", {
      body: JSON.stringify(input),
      headers: {
        "Content-Type": "application/json",
        ...(options.idempotencyKey !== undefined
          ? { "Idempotency-Key": options.idempotencyKey }
          : {}),
      },
      method: "POST",
    });
  }

  get(id: string): Promise<Email> {
    return this.#request<Email>(`api/v1/emails/${encodeURIComponent(id)}`, {
      method: "GET",
    });
  }
}
