import {
  DeleteObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  S3Client,
  type GetObjectCommandOutput,
  type ListObjectsV2CommandOutput,
} from "@aws-sdk/client-s3";
import {
  inboundSinkholeReasonFromPayload,
  MAX_INBOUND_RAW_BYTES,
  parseInboundEmailInput,
} from "@/lib/inbound-core";
import {
  findLiveOrgForInboundRecipients,
  receiveInboundEmail,
} from "@/lib/inbound";
import {
  parseInboundS3Config,
  processInboundS3Objects,
  type InboundS3Config,
  type InboundS3PollResult,
} from "@/lib/inbound-s3-core";

export type InboundS3Client = {
  send: (
    command: DeleteObjectCommand | GetObjectCommand | ListObjectsV2Command,
  ) => Promise<GetObjectCommandOutput | ListObjectsV2CommandOutput | unknown>;
};

async function listInboundObjectKeys(
  client: InboundS3Client,
  config: InboundS3Config,
): Promise<string[]> {
  const keys: string[] = [];
  let continuationToken: string | undefined;

  do {
    const response = (await client.send(
      new ListObjectsV2Command({
        Bucket: config.bucket,
        ContinuationToken: continuationToken,
        Prefix: `${config.prefix}/`,
      }),
    )) as ListObjectsV2CommandOutput;

    for (const object of response.Contents ?? []) {
      if (object.Key) keys.push(object.Key);
    }

    continuationToken = response.IsTruncated
      ? response.NextContinuationToken
      : undefined;
  } while (continuationToken);

  return keys;
}

async function readInboundObject(
  client: InboundS3Client,
  config: InboundS3Config,
  key: string,
): Promise<string> {
  const response = (await client.send(
    new GetObjectCommand({
      Bucket: config.bucket,
      Key: key,
    }),
  )) as GetObjectCommandOutput;
  const bytes = await response.Body?.transformToByteArray();
  if (!bytes || bytes.byteLength === 0) {
    throw new Error("Inbound object is empty.");
  }
  if (bytes.byteLength > MAX_INBOUND_RAW_BYTES) {
    throw new Error("Inbound object exceeds the receive limit.");
  }
  return Buffer.from(bytes).toString("utf8");
}

export async function processInboundS3Queue(
  options: {
    client?: InboundS3Client;
    environment?: Readonly<Record<string, string | undefined>>;
    receive?: typeof receiveInboundEmail;
    resolveOrg?: typeof findLiveOrgForInboundRecipients;
  } = {},
): Promise<InboundS3PollResult> {
  const environment = options.environment ?? process.env;
  const config = parseInboundS3Config(environment);
  if (!config) {
    return { deleted: 0, failed: 0, skipped: 0 };
  }

  const client = options.client ?? new S3Client({ region: config.region });
  const receive = options.receive ?? receiveInboundEmail;
  const resolveOrg = options.resolveOrg ?? findLiveOrgForInboundRecipients;

  return processInboundS3Objects({
    deleteObject: async (key) => {
      await client.send(
        new DeleteObjectCommand({
          Bucket: config.bucket,
          Key: key,
        }),
      );
    },
    getObject: (key) => readInboundObject(client, config, key),
    keys: await listInboundObjectKeys(client, config),
    processEmail: async (raw) => {
      if (inboundSinkholeReasonFromPayload({ email: raw })) {
        return true;
      }

      const parsed = await parseInboundEmailInput({ email: raw });
      const orgId = await resolveOrg(parsed.to);
      if (!orgId) return false;

      await receive({
        payload: { email: raw },
        principal: {
          environment: "live",
          orgId,
        },
      });
      return true;
    },
  });
}
