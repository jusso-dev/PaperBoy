import { authenticateApiRequest } from "@/lib/api-key-request";
import { broadcastApiServices } from "@/lib/broadcast-api-services";
import { handleResumeBroadcastRequest } from "@/lib/broadcast-http";

type BroadcastRouteContext = {
  params: Promise<{ broadcastId: string }>;
};

const dependencies = {
  authenticate: authenticateApiRequest,
  services: broadcastApiServices,
};

export async function POST(request: Request, context: BroadcastRouteContext) {
  const { broadcastId } = await context.params;
  return handleResumeBroadcastRequest(request, broadcastId, dependencies);
}
