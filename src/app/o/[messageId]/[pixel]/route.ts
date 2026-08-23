import { recordOpenTrackingHit } from "@/lib/open-tracking";
import { handleOpenTrackingPixelRequest } from "@/lib/open-tracking-http";

type OpenTrackingRouteContext = {
  params: Promise<{ messageId: string; pixel: string }>;
};

export async function GET(
  _request: Request,
  context: OpenTrackingRouteContext,
) {
  const { messageId, pixel } = await context.params;
  const signature = pixel.endsWith(".gif") ? pixel.slice(0, -4) : "";
  return handleOpenTrackingPixelRequest(
    { messageId, signature },
    { record: recordOpenTrackingHit },
  );
}
