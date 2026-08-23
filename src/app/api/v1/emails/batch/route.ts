import { authenticateApiRequest } from "@/lib/api-key-request";
import { handleSendEmailBatchRequest } from "@/lib/email-batch-http";
import { queueEmailBatch } from "@/lib/messages";

export async function POST(request: Request) {
  return handleSendEmailBatchRequest(request, {
    authenticate: authenticateApiRequest,
    queueBatch: queueEmailBatch,
  });
}
