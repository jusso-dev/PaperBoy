import { authenticateApiRequest } from "@/lib/api-key-request";
import { rateLimitApiServices } from "@/lib/rate-limit-api-services";
import {
  handleGetRateLimitsRequest,
  handleUpdateRateLimitsRequest,
} from "@/lib/rate-limit-http";

const dependencies = {
  authenticate: authenticateApiRequest,
  services: rateLimitApiServices,
};

export async function GET(request: Request) {
  return handleGetRateLimitsRequest(request, dependencies);
}

export async function PATCH(request: Request) {
  return handleUpdateRateLimitsRequest(request, dependencies);
}
