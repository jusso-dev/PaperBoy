import { authenticateApiRequest } from "@/lib/api-key-request";
import { suppressionApiServices } from "@/lib/suppression-api-services";
import {
  handleCreateSuppressionRequest,
  handleListSuppressionsRequest,
} from "@/lib/suppression-http";

const dependencies = {
  authenticate: authenticateApiRequest,
  services: suppressionApiServices,
};

export async function GET(request: Request) {
  return handleListSuppressionsRequest(request, dependencies);
}

export async function POST(request: Request) {
  return handleCreateSuppressionRequest(request, dependencies);
}
