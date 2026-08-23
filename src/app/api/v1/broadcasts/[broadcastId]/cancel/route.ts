import { authenticateApiRequest } from "@/lib/api-key-request";
import { broadcastApiServices } from "@/lib/broadcast-api-services";
import { handleCancelBroadcastRequest } from "@/lib/broadcast-http";

type BroadcastRouteContext = {
  params: Promise<{ broadcastId: string }>;
};

const dependencies = {
  authenticate: authenticateApiRequest,
  services: broadcastApiServices,
};

export async function POST(request: Request, context: BroadcastRouteContext) {
  const { broadcastId } = await context.params;
  return handleCancelBroadcastRequest(request, broadcastId, dependencies);
}
