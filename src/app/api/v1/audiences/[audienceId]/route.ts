import { authenticateApiRequest } from "@/lib/api-key-request";
import { audienceApiServices } from "@/lib/audience-api-services";
import {
  handleDeleteAudienceRequest,
  handleGetAudienceRequest,
  handleUpdateAudienceRequest,
} from "@/lib/audience-http";

type Context = { params: Promise<{ audienceId: string }> };
const dependencies = { authenticate: authenticateApiRequest, services: audienceApiServices };

export async function GET(request: Request, context: Context) {
  return handleGetAudienceRequest(request, (await context.params).audienceId, dependencies);
}

export async function PATCH(request: Request, context: Context) {
  return handleUpdateAudienceRequest(request, (await context.params).audienceId, dependencies);
}

export async function DELETE(request: Request, context: Context) {
  return handleDeleteAudienceRequest(request, (await context.params).audienceId, dependencies);
}
