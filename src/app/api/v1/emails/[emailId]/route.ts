import { authenticateApiRequest } from "@/lib/api-key-request";
import { messageApiServices } from "@/lib/message-api-services";
import {
  handleGetMessageRequest,
  handleRescheduleMessageRequest,
} from "@/lib/message-http";

type EmailRouteContext = {
  params: Promise<{ emailId: string }>;
};

const dependencies = {
  authenticate: authenticateApiRequest,
  services: messageApiServices,
};

export async function GET(request: Request, context: EmailRouteContext) {
  const { emailId } = await context.params;
  return handleGetMessageRequest(request, emailId, dependencies);
}

export async function PATCH(request: Request, context: EmailRouteContext) {
  const { emailId } = await context.params;
  return handleRescheduleMessageRequest(request, emailId, dependencies);
}
