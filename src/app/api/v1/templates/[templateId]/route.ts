import { authenticateApiRequest } from "@/lib/api-key-request";
import { templateApiServices } from "@/lib/template-api-services";
import {
  handleDeleteTemplateRequest,
  handleGetTemplateRequest,
  handleUpdateTemplateRequest,
} from "@/lib/template-http";

type TemplateRouteContext = {
  params: Promise<{ templateId: string }>;
};

const dependencies = {
  authenticate: authenticateApiRequest,
  services: templateApiServices,
};

export async function GET(request: Request, context: TemplateRouteContext) {
  const { templateId } = await context.params;
  return handleGetTemplateRequest(request, templateId, dependencies);
}

export async function PATCH(request: Request, context: TemplateRouteContext) {
  const { templateId } = await context.params;
  return handleUpdateTemplateRequest(request, templateId, dependencies);
}

export async function DELETE(request: Request, context: TemplateRouteContext) {
  const { templateId } = await context.params;
  return handleDeleteTemplateRequest(request, templateId, dependencies);
}
