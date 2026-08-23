import { authenticateApiRequest } from "@/lib/api-key-request";
import { audienceApiServices } from "@/lib/audience-api-services";
import {
  handleDeleteContactRequest,
  handleGetContactRequest,
  handleUpdateContactRequest,
} from "@/lib/audience-http";

type Context = { params: Promise<{ audienceId: string; contactId: string }> };
const dependencies = { authenticate: authenticateApiRequest, services: audienceApiServices };

export async function GET(request: Request, context: Context) {
  const { audienceId, contactId } = await context.params;
  return handleGetContactRequest(request, audienceId, contactId, dependencies);
}

export async function PATCH(request: Request, context: Context) {
  const { audienceId, contactId } = await context.params;
  return handleUpdateContactRequest(request, audienceId, contactId, dependencies);
}

export async function DELETE(request: Request, context: Context) {
  const { audienceId, contactId } = await context.params;
  return handleDeleteContactRequest(request, audienceId, contactId, dependencies);
}
