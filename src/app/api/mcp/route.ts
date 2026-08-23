import {
  apiKeyUnauthorizedResponse,
  authenticateApiRequest,
} from "@/lib/api-key-request";
import {
  mcpAuthInfo,
  paperBoyMcpHttpHandler,
} from "@/mcp/http";

function noStore(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set("Cache-Control", "no-store");

  return new Response(response.body, {
    headers,
    status: response.status,
    statusText: response.statusText,
  });
}

function rejectsOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");

  if (!origin) {
    return false;
  }

  try {
    return new URL(origin).origin !== new URL(request.url).origin;
  } catch {
    return true;
  }
}

async function handleMcpRequest(request: Request) {
  if (rejectsOrigin(request)) {
    return Response.json(
      {
        error: {
          code: "forbidden",
          message: "Cross-origin MCP requests are not allowed.",
        },
      },
      { headers: { "Cache-Control": "no-store" }, status: 403 },
    );
  }

  const principal = await authenticateApiRequest(request);

  if (!principal) {
    return apiKeyUnauthorizedResponse();
  }

  const response = await paperBoyMcpHttpHandler.fetch(request, {
    authInfo: mcpAuthInfo(principal),
  });

  return noStore(response);
}

export const DELETE = handleMcpRequest;
export const GET = handleMcpRequest;
export const POST = handleMcpRequest;
