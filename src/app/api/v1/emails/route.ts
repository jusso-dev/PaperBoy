import {
  apiKeyUnauthorizedResponse,
  authenticateApiRequest,
} from "@/lib/api-key-request";

export async function POST(request: Request) {
  const principal = await authenticateApiRequest(request);

  if (!principal) {
    return apiKeyUnauthorizedResponse();
  }

  return Response.json(
    {
      error: {
        code: "not_implemented",
        message: "Email sending is not available in this build.",
      },
    },
    { status: 501 },
  );
}
