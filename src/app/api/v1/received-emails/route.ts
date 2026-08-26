import { authenticateApiRequest } from "@/lib/api-key-request";
import { handleReceiveInboundEmailRequest } from "@/lib/inbound-http";

export async function POST(request: Request) {
  return handleReceiveInboundEmailRequest(request, {
    authenticate: authenticateApiRequest,
  });
}
