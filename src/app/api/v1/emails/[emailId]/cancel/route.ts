import { authenticateApiRequest } from "@/lib/api-key-request";
import { messageApiServices } from "@/lib/message-api-services";
import { handleCancelMessageRequest } from "@/lib/message-http";

type EmailCancelRouteContext = {
  params: Promise<{ emailId: string }>;
};

const dependencies = {
  authenticate: authenticateApiRequest,
  services: messageApiServices,
};

export async function POST(request: Request, context: EmailCancelRouteContext) {
  const { emailId } = await context.params;
  return handleCancelMessageRequest(request, emailId, dependencies);
}
