import { authenticateApiRequest } from "@/lib/api-key-request";
import { handleSendEmailRequest } from "@/lib/email-http";
import { messageApiServices } from "@/lib/message-api-services";
import { handleListMessagesRequest } from "@/lib/message-http";
import { queueEmail } from "@/lib/messages";

const dependencies = {
  authenticate: authenticateApiRequest,
  services: messageApiServices,
};

export async function GET(request: Request) {
  return handleListMessagesRequest(request, dependencies);
}

export async function POST(request: Request) {
  return handleSendEmailRequest(request, {
    authenticate: authenticateApiRequest,
    queue: queueEmail,
  });
}
