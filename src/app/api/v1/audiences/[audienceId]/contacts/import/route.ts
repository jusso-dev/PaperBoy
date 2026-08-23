import { authenticateApiRequest } from "@/lib/api-key-request";
import { audienceApiServices } from "@/lib/audience-api-services";
import { handleImportContactsRequest } from "@/lib/audience-http";

type Context = { params: Promise<{ audienceId: string }> };
const dependencies = { authenticate: authenticateApiRequest, services: audienceApiServices };

export async function POST(request: Request, context: Context) {
  return handleImportContactsRequest(request, (await context.params).audienceId, dependencies);
}
