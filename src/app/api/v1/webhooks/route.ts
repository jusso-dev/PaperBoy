import { authenticateApiRequest } from "@/lib/api-key-request";
import { webhookApiServices } from "@/lib/webhook-api-services";
import {
  handleConfigureWebhookRequest,
  handleGetWebhookRequest,
} from "@/lib/webhook-http";

const dependencies = {
  authenticate: authenticateApiRequest,
  services: webhookApiServices,
};

export function GET(request: Request) {
  return handleGetWebhookRequest(request, dependencies);
}

export function PUT(request: Request) {
  return handleConfigureWebhookRequest(request, dependencies);
}
