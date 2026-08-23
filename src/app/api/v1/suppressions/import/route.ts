import { authenticateApiRequest } from "@/lib/api-key-request";
import { suppressionApiServices } from "@/lib/suppression-api-services";
import { handleImportSuppressionsRequest } from "@/lib/suppression-http";

const dependencies = {
  authenticate: authenticateApiRequest,
  services: suppressionApiServices,
};

export async function POST(request: Request) {
  return handleImportSuppressionsRequest(request, dependencies);
}
