import { authenticateApiRequest } from "@/lib/api-key-request";
import { outboundProviderApiServices } from "@/lib/outbound-provider-api-services";
import {
  handleGetOutboundProvidersRequest,
  handleUpdateOutboundProvidersRequest,
} from "@/lib/outbound-provider-http";

const dependencies = {
  authenticate: authenticateApiRequest,
  services: outboundProviderApiServices,
};

export function GET(request: Request) {
  return handleGetOutboundProvidersRequest(request, dependencies);
}

export function PATCH(request: Request) {
  return handleUpdateOutboundProvidersRequest(request, dependencies);
}
