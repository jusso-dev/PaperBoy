import { recordClickTrackingHit } from "@/lib/click-tracking";
import { handleClickTrackingRedirectRequest } from "@/lib/click-tracking-http";

type ClickTrackingRouteContext = {
  params: Promise<{ messageId: string; signature: string }>;
};

export async function GET(
  request: Request,
  context: ClickTrackingRouteContext,
) {
  const { messageId, signature } = await context.params;
  const targetUrl = new URL(request.url).searchParams.get("u");
  return handleClickTrackingRedirectRequest(
    { messageId, signature, targetUrl },
    { record: recordClickTrackingHit },
  );
}
