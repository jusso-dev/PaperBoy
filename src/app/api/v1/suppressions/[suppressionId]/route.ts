import { authenticateApiRequest } from "@/lib/api-key-request";
import { suppressionApiServices } from "@/lib/suppression-api-services";
import {
  handleDeleteSuppressionRequest,
  handleGetSuppressionRequest,
  handleUpdateSuppressionRequest,
} from "@/lib/suppression-http";

type SuppressionRouteContext = {
  params: Promise<{ suppressionId: string }>;
};

const dependencies = {
  authenticate: authenticateApiRequest,
  services: suppressionApiServices,
};

export async function GET(request: Request, context: SuppressionRouteContext) {
  const { suppressionId } = await context.params;
  return handleGetSuppressionRequest(request, suppressionId, dependencies);
}

export async function PATCH(request: Request, context: SuppressionRouteContext) {
  const { suppressionId } = await context.params;
  return handleUpdateSuppressionRequest(request, suppressionId, dependencies);
}

export async function DELETE(request: Request, context: SuppressionRouteContext) {
  const { suppressionId } = await context.params;
  return handleDeleteSuppressionRequest(request, suppressionId, dependencies);
}
