import { authenticateApiRequest } from "@/lib/api-key-request";
import { outboundProviderApiServices } from "@/lib/outbound-provider-api-services";
import { handleIngestOutboundProviderEventRequest } from "@/lib/outbound-provider-event-http";

export function POST(request: Request) {
  return handleIngestOutboundProviderEventRequest(request, "aws-ses", {
    authenticate: authenticateApiRequest,
    ingest: outboundProviderApiServices.ingest,
  });
}
