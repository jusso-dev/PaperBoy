import type { ApiKeyPrincipal } from "@/lib/api-key-auth";
import { DomainError } from "@/lib/domain-core";
import {
  describeEmailFailure,
  emailJson,
} from "@/lib/email-http";
import {
  inboundEmailApiBody,
  isDiscardedInboundEmail,
  type DiscardedInboundEmail,
} from "@/lib/inbound-core";
import type { ReceivedEmailRecord } from "@/lib/inbound";
import { MessageStatusError } from "@/lib/message-status-core";

export type InboundHttpDependencies = {
  authenticate: (request: Request) => Promise<ApiKeyPrincipal | null>;
  get?: (
    principal: ApiKeyPrincipal,
    receivedEmailId: string,
  ) => Promise<ReceivedEmailRecord>;
  receive?: (
    principal: ApiKeyPrincipal,
    payload: unknown,
  ) => Promise<ReceivedEmailRecord | DiscardedInboundEmail>;
};

function unauthorized(): Response {
  return emailJson(
    {
      error: {
        code: "unauthorized",
        message: "A valid PaperBoy API key is required.",
      },
    },
    401,
    { "WWW-Authenticate": 'Bearer realm="PaperBoy"' },
  );
}

function inboundFailure(error: unknown): Response {
  if (error instanceof MessageStatusError && error.code === "MESSAGE_NOT_FOUND") {
    return emailJson(
      {
        error: {
          code: "email_not_found",
          message: "No received email with that ID exists in this environment.",
        },
      },
      404,
    );
  }

  if (error instanceof DomainError) {
    const invalid = error.code === "INVALID_DOMAIN";
    return emailJson(
      {
        error: {
          code: invalid ? "invalid_to_domain" : "domain_not_verified",
          message: invalid
            ? "The inbound recipient must use a valid organization domain."
            : "Verify the inbound recipient domain before receiving with a live API key.",
        },
      },
      422,
    );
  }

  const failure = describeEmailFailure(error);
  return emailJson(failure.body, failure.status, failure.headers);
}

export async function handleReceiveInboundEmailRequest(
  request: Request,
  dependencies: InboundHttpDependencies,
): Promise<Response> {
  const principal = await dependencies.authenticate(request);
  if (!principal) return unauthorized();

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return emailJson(
      {
        error: {
          code: "invalid_json",
          message: "Provide a valid JSON request body.",
        },
      },
      400,
    );
  }

  try {
    const receive =
      dependencies.receive ??
      (async (actor, body) => {
        const { receiveInboundEmail } = await import("@/lib/inbound");
        return receiveInboundEmail({ payload: body, principal: actor });
      });
    const email = await receive(principal, payload);
    if (isDiscardedInboundEmail(email)) {
      return emailJson(
        {
          discarded: true,
          object: "email",
          reason: email.reason,
        },
        202,
      );
    }
    return emailJson({ id: email.id, object: "email" }, email.replayed ? 200 : 201);
  } catch (error) {
    return inboundFailure(error);
  }
}

export async function handleGetReceivedEmailRequest(
  request: Request,
  receivedEmailId: string,
  dependencies: InboundHttpDependencies,
): Promise<Response> {
  const principal = await dependencies.authenticate(request);
  if (!principal) return unauthorized();

  try {
    const get =
      dependencies.get ??
      (async (actor, id) => {
        const { getReceivedEmail } = await import("@/lib/inbound");
        return getReceivedEmail({
          environment: actor.environment,
          orgId: actor.orgId,
          receivedEmailId: id,
        });
      });
    const email = await get(principal, receivedEmailId);
    return emailJson(inboundEmailApiBody(email), 200);
  } catch (error) {
    return inboundFailure(error);
  }
}
