import { isTrackableUrl } from "@/lib/click-tracking-core";

export async function handleClickTrackingRedirectRequest(
  input: { messageId: string; signature: string; targetUrl: string | null },
  dependencies: {
    record: (input: {
      messageId: string;
      signature: string;
      targetUrl: string;
    }) => Promise<boolean>;
  },
): Promise<Response> {
  const fallback = new Response("That tracking link is no longer valid.", {
    headers: { "Cache-Control": "no-store" },
    status: 404,
  });
  if (!input.targetUrl || !isTrackableUrl(input.targetUrl)) return fallback;
  let recorded = false;
  try {
    recorded = await dependencies.record({
      messageId: input.messageId,
      signature: input.signature,
      targetUrl: input.targetUrl,
    });
  } catch {
    console.error("PaperBoy could not record a click-tracking request.");
    return fallback;
  }
  if (!recorded) return fallback;
  return Response.redirect(input.targetUrl, 302);
}
