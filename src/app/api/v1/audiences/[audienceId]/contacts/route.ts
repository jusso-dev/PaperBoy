import { authenticateApiRequest } from "@/lib/api-key-request";
import { audienceApiServices } from "@/lib/audience-api-services";
import {
  handleCreateContactRequest,
  handleListContactsRequest,
} from "@/lib/audience-http";

type Context = { params: Promise<{ audienceId: string }> };
const dependencies = { authenticate: authenticateApiRequest, services: audienceApiServices };

export async function GET(request: Request, context: Context) {
  return handleListContactsRequest(request, (await context.params).audienceId, dependencies);
}

export async function POST(request: Request, context: Context) {
  return handleCreateContactRequest(request, (await context.params).audienceId, dependencies);
}
