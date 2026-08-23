import "server-only";

import { authenticateApiKey } from "@/lib/api-keys";

export async function authenticateApiRequest(request: Request) {
  const authorization = request.headers.get("authorization");
  const match = authorization?.match(/^Bearer\s+([^\s]+)$/i);

  return authenticateApiKey(match?.[1]);
}

export function apiKeyUnauthorizedResponse() {
  return Response.json(
    {
      error: {
        code: "unauthorized",
        message: "A valid PaperBoy API key is required.",
      },
    },
    {
      headers: {
        "Cache-Control": "no-store",
        "WWW-Authenticate": 'Bearer realm="PaperBoy"',
      },
      status: 401,
    },
  );
}
