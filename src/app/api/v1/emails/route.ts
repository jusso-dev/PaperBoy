import { authenticateApiRequest } from "@/lib/api-key-request";
import { handleSendEmailRequest } from "@/lib/email-http";
import { queueEmail } from "@/lib/messages";

export async function POST(request: Request) {
  return handleSendEmailRequest(request, {
    authenticate: authenticateApiRequest,
    queue: queueEmail,
  });
}
