import { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";
import type { ApiKeyPrincipal } from "@/lib/api-key-auth";
import { AuthorizationError } from "@/lib/authorization";
import { protocolTimestamp } from "@/lib/time";
import { PAPERBOY_MCP_SCHEMA_VERSION } from "@/mcp/contract";

export type OrganizationInvitationRecord = {
  createdAt: Date;
  email: string;
  id: string;
  role: string;
};

export type OrganizationInviteResult = {
  emailError:
    | "ACCEPT_URL_UNAVAILABLE"
    | "INVITE_EMAIL"
    | "SENDER_UNAVAILABLE"
    | null;
  invitation: OrganizationInvitationRecord;
  queuedId: string | null;
};

export const PAPERBOY_INVITATION_MCP_TOOL_NAMES = [
  "paperboy_list_invitations",
  "paperboy_invite_member",
] as const;

export const PAPERBOY_INVITATION_MCP_TOOL_DEFINITIONS = [
  {
    description:
      "List pending organization invitations for the authenticated organization. Does not return invite email bodies.",
    mutating: false,
    name: PAPERBOY_INVITATION_MCP_TOOL_NAMES[0],
    schemaVersion: PAPERBOY_MCP_SCHEMA_VERSION,
  },
  {
    description:
      "Invite one person by email to the authenticated organization as admin or member, then queue the live invite email. Organization context comes from the API key.",
    mutating: true,
    name: PAPERBOY_INVITATION_MCP_TOOL_NAMES[1],
    schemaVersion: PAPERBOY_MCP_SCHEMA_VERSION,
  },
] as const;

export type PaperBoyMcpInvitationServices = {
  invite: (
    principal: ApiKeyPrincipal,
    input: { email: string; role: "admin" | "member" },
  ) => Promise<OrganizationInviteResult>;
  list: (
    principal: ApiKeyPrincipal,
  ) => Promise<OrganizationInvitationRecord[]>;
};

const invitationSchema = z.object({
  createdAt: z.iso.datetime({ offset: true }),
  email: z.string(),
  id: z.string().uuid(),
  role: z.enum(["admin", "member"]),
});

const metadataSchema = {
  observedAt: z.iso.datetime({ offset: true }),
  protocolTimeZone: z.literal("UTC"),
  schemaVersion: z.literal(PAPERBOY_MCP_SCHEMA_VERSION),
};

const listOutputSchema = z.object({
  ...metadataSchema,
  invitations: z.array(invitationSchema),
});

const inviteOutputSchema = z.object({
  ...metadataSchema,
  emailed: z.boolean(),
  invitation: invitationSchema,
  messageId: z.string().uuid().nullable(),
});

function organizationErrorCode(error: unknown): string | null {
  if (
    !(error instanceof Error) ||
    error.name !== "OrganizationError" ||
    !("code" in error) ||
    typeof error.code !== "string"
  ) {
    return null;
  }

  return error.code;
}

function serialize(invitation: OrganizationInvitationRecord) {
  return {
    createdAt: protocolTimestamp(invitation.createdAt),
    email: invitation.email,
    id: invitation.id,
    role: invitation.role as "admin" | "member",
  };
}

function unauthorizedResult() {
  return {
    content: [
      {
        text: "Authorization failed. Reconnect with a valid PaperBoy API key.",
        type: "text" as const,
      },
    ],
    isError: true,
  };
}

function errorResult(error: unknown) {
  let message = "The invitation operation failed.";

  const orgCode = organizationErrorCode(error);

  if (error instanceof AuthorizationError) {
    message =
      "The API key creator's current role does not allow organization invitations.";
  } else if (orgCode) {
    switch (orgCode) {
      case "ALREADY_MEMBER":
        message = "That person is already a member of this organization.";
        break;
      case "INVALID_EMAIL":
        message = "Provide one valid email address.";
        break;
      case "INVALID_ROLE":
        message = "Choose the admin or member role.";
        break;
      case "MEMBERSHIP_REQUIRED":
        message = "Create a new API key from a current organization owner or admin.";
        break;
      default:
        message = "That invitation is no longer available.";
    }
  } else {
    console.error("PaperBoy MCP invitation operation failed.");
  }

  return { content: [{ text: message, type: "text" as const }], isError: true };
}

function successResult(output: Record<string, unknown>) {
  return {
    content: [{ text: JSON.stringify(output, null, 2), type: "text" as const }],
    structuredContent: output,
  };
}

export function registerPaperBoyInvitationTools(input: {
  authorize: () => Promise<ApiKeyPrincipal | null>;
  now?: () => Date;
  server: McpServer;
  services: PaperBoyMcpInvitationServices;
}) {
  const now = input.now ?? (() => new Date());
  const metadata = () => ({
    observedAt: protocolTimestamp(now()),
    protocolTimeZone: "UTC" as const,
    schemaVersion: PAPERBOY_MCP_SCHEMA_VERSION,
  });

  input.server.registerTool(
    PAPERBOY_INVITATION_MCP_TOOL_NAMES[0],
    {
      annotations: {
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
        readOnlyHint: true,
      },
      description: PAPERBOY_INVITATION_MCP_TOOL_DEFINITIONS[0].description,
      inputSchema: z.object({}).strict(),
      outputSchema: listOutputSchema,
      title: "List PaperBoy invitations",
      _meta: { "paperboy/schemaVersion": PAPERBOY_MCP_SCHEMA_VERSION },
    },
    async () => {
      const principal = await input.authorize();
      if (!principal) return unauthorizedResult();

      try {
        const invitations = await input.services.list(principal);
        return successResult({
          ...metadata(),
          invitations: invitations.map(serialize),
        });
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  input.server.registerTool(
    PAPERBOY_INVITATION_MCP_TOOL_NAMES[1],
    {
      annotations: {
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
        readOnlyHint: false,
      },
      description: PAPERBOY_INVITATION_MCP_TOOL_DEFINITIONS[1].description,
      inputSchema: z
        .object({
          email: z.string().min(3).max(254),
          role: z.enum(["admin", "member"]).default("member"),
        })
        .strict(),
      outputSchema: inviteOutputSchema,
      title: "Invite a PaperBoy member",
      _meta: { "paperboy/schemaVersion": PAPERBOY_MCP_SCHEMA_VERSION },
    },
    async ({ email, role }) => {
      const principal = await input.authorize();
      if (!principal) return unauthorizedResult();

      try {
        const invited = await input.services.invite(principal, {
          email,
          role: role ?? "member",
        });
        return successResult({
          ...metadata(),
          emailed: invited.queuedId !== null,
          invitation: serialize(invited.invitation),
          messageId: invited.queuedId,
        });
      } catch (error) {
        return errorResult(error);
      }
    },
  );
}
