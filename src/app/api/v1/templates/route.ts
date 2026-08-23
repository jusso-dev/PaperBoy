import { authenticateApiRequest } from "@/lib/api-key-request";
import { templateApiServices } from "@/lib/template-api-services";
import {
  handleCreateTemplateRequest,
  handleListTemplatesRequest,
} from "@/lib/template-http";

const dependencies = {
  authenticate: authenticateApiRequest,
  services: templateApiServices,
};

export async function GET(request: Request) {
  return handleListTemplatesRequest(request, dependencies);
}

export async function POST(request: Request) {
  return handleCreateTemplateRequest(request, dependencies);
}
