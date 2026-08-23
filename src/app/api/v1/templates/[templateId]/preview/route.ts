import { authenticateApiRequest } from "@/lib/api-key-request";
import { templateApiServices } from "@/lib/template-api-services";
import { handlePreviewTemplateRequest } from "@/lib/template-http";

type TemplatePreviewRouteContext = {
  params: Promise<{ templateId: string }>;
};

const dependencies = {
  authenticate: authenticateApiRequest,
  services: templateApiServices,
};

export async function POST(
  request: Request,
  context: TemplatePreviewRouteContext,
) {
  const { templateId } = await context.params;
  return handlePreviewTemplateRequest(request, templateId, dependencies);
}
