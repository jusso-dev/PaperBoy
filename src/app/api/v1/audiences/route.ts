import { authenticateApiRequest } from "@/lib/api-key-request";
import { audienceApiServices } from "@/lib/audience-api-services";
import {
  handleCreateAudienceRequest,
  handleListAudiencesRequest,
} from "@/lib/audience-http";

const dependencies = { authenticate: authenticateApiRequest, services: audienceApiServices };

export async function GET(request: Request) {
  return handleListAudiencesRequest(request, dependencies);
}

export async function POST(request: Request) {
  return handleCreateAudienceRequest(request, dependencies);
}
