import { authenticateApiRequest } from "@/lib/api-key-request";
import { openTrackingApiServices } from "@/lib/open-tracking-api-services";
import {
  handleGetOpenTrackingRequest,
  handleUpdateOpenTrackingRequest,
} from "@/lib/open-tracking-http";

const dependencies = {
  authenticate: authenticateApiRequest,
  services: openTrackingApiServices,
};

export async function GET(request: Request) {
  return handleGetOpenTrackingRequest(request, dependencies);
}

export async function PATCH(request: Request) {
  return handleUpdateOpenTrackingRequest(request, dependencies);
}
