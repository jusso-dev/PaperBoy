import { authenticateApiRequest } from "@/lib/api-key-request";
import { broadcastApiServices } from "@/lib/broadcast-api-services";
import {
  handleCreateBroadcastRequest,
  handleListBroadcastsRequest,
} from "@/lib/broadcast-http";

const dependencies = {
  authenticate: authenticateApiRequest,
  services: broadcastApiServices,
};

export async function GET(request: Request) {
  return handleListBroadcastsRequest(request, dependencies);
}

export async function POST(request: Request) {
  return handleCreateBroadcastRequest(request, dependencies);
}
