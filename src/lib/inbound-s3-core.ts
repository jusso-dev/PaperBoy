const S3_BUCKET_PATTERN =
  /^(?!\d{1,3}(?:\.\d{1,3}){3}$)(?!.*\.\.)(?!.*(?:\.-|-\.))[a-z0-9][a-zA-Z0-9.-]{1,61}[a-z0-9]$/;
const S3_PREFIX_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9/_-]{0,127}$/;
const S3_REGION_PATTERN = /^[a-z0-9][a-z0-9-]{1,30}[a-z0-9]$/;

export type InboundS3Config = {
  bucket: string;
  prefix: string;
  region: string;
};

export type InboundS3PollResult = {
  deleted: number;
  failed: number;
  skipped: number;
};

export class InboundS3ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InboundS3ConfigError";
  }
}

export function parseInboundS3Config(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): InboundS3Config | null {
  const bucket = environment.PAPERBOY_INBOUND_S3_BUCKET?.trim();
  const region = environment.PAPERBOY_INBOUND_S3_REGION?.trim();
  const prefixValue = environment.PAPERBOY_INBOUND_S3_PREFIX?.trim();

  if (!bucket && !region && !prefixValue) {
    return null;
  }

  if (!bucket || !S3_BUCKET_PATTERN.test(bucket)) {
    throw new InboundS3ConfigError(
      "PAPERBOY_INBOUND_S3_BUCKET must be a valid S3 bucket name.",
    );
  }

  if (!region || !S3_REGION_PATTERN.test(region)) {
    throw new InboundS3ConfigError(
      "PAPERBOY_INBOUND_S3_REGION must be a valid AWS region.",
    );
  }

  const prefix = (prefixValue || "inbound").replace(/\/+$/, "");
  if (!S3_PREFIX_PATTERN.test(prefix)) {
    throw new InboundS3ConfigError(
      "PAPERBOY_INBOUND_S3_PREFIX must be a safe object prefix.",
    );
  }

  return { bucket, prefix, region };
}

export function shouldSkipInboundObjectKey(key: string): boolean {
  const name = key.split("/").pop() ?? key;
  return name === "AMAZON_SES_SETUP_NOTIFICATION" || name.length === 0;
}

export async function processInboundS3Objects(input: {
  deleteObject: (key: string) => Promise<void>;
  getObject: (key: string) => Promise<string>;
  keys: readonly string[];
  processEmail: (raw: string) => Promise<boolean>;
}): Promise<InboundS3PollResult> {
  const result: InboundS3PollResult = {
    deleted: 0,
    failed: 0,
    skipped: 0,
  };

  for (const key of input.keys) {
    if (shouldSkipInboundObjectKey(key)) {
      result.skipped += 1;
      continue;
    }

    try {
      const processed = await input.processEmail(await input.getObject(key));
      if (!processed) {
        result.failed += 1;
        continue;
      }

      await input.deleteObject(key);
      result.deleted += 1;
    } catch {
      result.failed += 1;
    }
  }

  return result;
}
