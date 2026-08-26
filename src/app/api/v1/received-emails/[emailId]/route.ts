import { authenticateApiRequest } from "@/lib/api-key-request";
import { handleGetReceivedEmailRequest } from "@/lib/inbound-http";

type ReceivedEmailRouteContext = {
  params: Promise<{ emailId: string }>;
};

export async function GET(request: Request, context: ReceivedEmailRouteContext) {
  const { emailId } = await context.params;
  return handleGetReceivedEmailRequest(request, emailId, {
    authenticate: authenticateApiRequest,
  });
}
