import { AWS_SES_MAX_EVENT_BYTES } from "@/lib/aws-ses-adapter";
import {
  AwsSnsVerificationError,
  confirmAwsSnsSubscription,
  verifyAwsSnsEnvelope,
  type AwsSnsEnvelope,
} from "@/lib/aws-sns";
import { providerAwsSesConfiguration } from "@/lib/outbound-provider-configuration";
import { OutboundProviderEventError } from "@/lib/outbound-provider-event-core";
import type { ingestVerifiedOutboundProviderEvent } from "@/lib/outbound-provider-events";

type Dependencies = {
  confirm?: (input: { envelope: AwsSnsEnvelope }) => Promise<void>;
  environment?: Readonly<Record<string, string | undefined>>;
  ingest?: typeof ingestVerifiedOutboundProviderEvent;
  verify?: (input: {
    expectedTopicArn: string;
    payload: unknown;
  }) => Promise<AwsSnsEnvelope>;
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function json(data: unknown, status: number): Response {
  return Response.json(data, {
    headers: { "Cache-Control": "no-store" },
    status,
  });
}

async function payload(request: Request): Promise<unknown> {
  const length = request.headers.get("content-length");
  if (length && /^\d+$/.test(length) && Number(length) > AWS_SES_MAX_EVENT_BYTES) {
    throw new OutboundProviderEventError("INVALID_EVENT");
  }
  const raw = await request.text();
  if (!raw || Buffer.byteLength(raw, "utf8") > AWS_SES_MAX_EVENT_BYTES) {
    throw new OutboundProviderEventError("INVALID_EVENT");
  }
  try {
    return JSON.parse(raw);
  } catch {
    throw new OutboundProviderEventError("INVALID_EVENT");
  }
}

export async function handleAwsSesSnsRequest(
  request: Request,
  orgId: string,
  dependencies: Dependencies = {},
): Promise<Response> {
  if (!UUID_PATTERN.test(orgId)) {
    return json({ accepted: false }, 404);
  }
  let configuration;
  try {
    configuration = providerAwsSesConfiguration({
      environment: dependencies.environment,
      orgId,
    });
  } catch {
    configuration = null;
  }
  if (!configuration?.snsTopicArn) {
    return json({ accepted: false }, 404);
  }
  try {
    const body = await payload(request);
    const envelope = await (dependencies.verify ?? verifyAwsSnsEnvelope)({
      expectedTopicArn: configuration.snsTopicArn,
      payload: body,
    });
    if (envelope.Type === "SubscriptionConfirmation") {
      await (dependencies.confirm ?? confirmAwsSnsSubscription)({ envelope });
      return new Response(null, { status: 204 });
    }
    if (envelope.Type !== "Notification") {
      return new Response(null, { status: 204 });
    }
    const ingest =
      dependencies.ingest ??
      (await import("@/lib/outbound-provider-events"))
        .ingestVerifiedOutboundProviderEvent;
    await ingest({
      orgId,
      payload: body,
      provider: "aws-ses",
    });
    return json({ accepted: true }, 202);
  } catch (error) {
    if (error instanceof AwsSnsVerificationError) {
      return json({ accepted: false }, 403);
    }
    if (error instanceof OutboundProviderEventError) {
      return json({ accepted: false }, 422);
    }
    console.error("PaperBoy Amazon SNS event handling failed.");
    return json({ accepted: false }, 500);
  }
}
