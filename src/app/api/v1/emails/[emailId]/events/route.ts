import { authenticateApiRequest } from "@/lib/api-key-request";
import { messageApiServices } from "@/lib/message-api-services";
import { handleListMessageEventsRequest } from "@/lib/message-http";

type EmailEventsRouteContext = {
  params: Promise<{ emailId: string }>;
};

const dependencies = {
  authenticate: authenticateApiRequest,
  services: messageApiServices,
};

export async function GET(request: Request, context: EmailEventsRouteContext) {
  const { emailId } = await context.params;
  return handleListMessageEventsRequest(request, emailId, dependencies);
}
