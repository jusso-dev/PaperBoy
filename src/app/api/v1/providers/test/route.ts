import { authenticateApiRequest } from "@/lib/api-key-request";
import { outboundProviderApiServices } from "@/lib/outbound-provider-api-services";
import { handleTestOutboundProviderRequest } from "@/lib/outbound-provider-http";

export function POST(request: Request) {
  return handleTestOutboundProviderRequest(request, {
    authenticate: authenticateApiRequest,
    services: outboundProviderApiServices,
  });
}
