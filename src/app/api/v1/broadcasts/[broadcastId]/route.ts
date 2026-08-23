import { authenticateApiRequest } from "@/lib/api-key-request";
import { broadcastApiServices } from "@/lib/broadcast-api-services";
import { handleGetBroadcastRequest } from "@/lib/broadcast-http";

type BroadcastRouteContext = {
  params: Promise<{ broadcastId: string }>;
};

const dependencies = {
  authenticate: authenticateApiRequest,
  services: broadcastApiServices,
};

export async function GET(request: Request, context: BroadcastRouteContext) {
  const { broadcastId } = await context.params;
  return handleGetBroadcastRequest(request, broadcastId, dependencies);
}
