export class OrganizationInviteEmailError extends Error {
  readonly code: "ACCEPT_URL_UNAVAILABLE" | "SENDER_UNAVAILABLE";

  constructor(code: "ACCEPT_URL_UNAVAILABLE" | "SENDER_UNAVAILABLE") {
    super(code);
    this.name = "OrganizationInviteEmailError";
    this.code = code;
  }
}

export function organizationInviteAcceptUrl(
  raw = process.env.PAPERBOY_PUBLIC_URL ?? process.env.BETTER_AUTH_URL,
): string {
  if (!raw) {
    throw new OrganizationInviteEmailError("ACCEPT_URL_UNAVAILABLE");
  }

  try {
    return new URL("/app/organization", raw.endsWith("/") ? raw : `${raw}/`).href;
  } catch {
    throw new OrganizationInviteEmailError("ACCEPT_URL_UNAVAILABLE");
  }
}

export function selectInviteSendingDomain(
  readyDomains: readonly string[],
  recipientEmail: string,
): string | null {
  if (readyDomains.length === 0) return null;
  const recipientDomain = recipientEmail.split("@")[1]?.toLowerCase();
  return (
    readyDomains.find((domain) => domain === recipientDomain) ??
    readyDomains[0] ??
    null
  );
}

export function organizationInviteFromAddress(domain: string): string {
  return `PaperBoy <invites@${domain}>`;
}

export function organizationInviteMessage(input: {
  acceptUrl: string;
  from: string;
  invitationId: string;
  orgName: string;
  role: string;
  to: string;
}) {
  const subject = `You're invited to ${input.orgName}`;
  const text = [
    `You've been invited to join ${input.orgName} on PaperBoy as ${input.role}.`,
    "",
    "Sign in with this email address, then accept the invitation:",
    input.acceptUrl,
    "",
    "If you do not have a PaperBoy account yet, create one with this same address first.",
  ].join("\n");

  return {
    from: input.from,
    html: `<p>You've been invited to join <strong>${escapeHtml(input.orgName)}</strong> on PaperBoy as ${escapeHtml(input.role)}.</p><p>Sign in with this email address, then <a href="${escapeHtml(input.acceptUrl)}">accept the invitation</a>.</p><p>If you do not have a PaperBoy account yet, create one with this same address first.</p>`,
    subject,
    tags: [
      { name: "invitation_id", value: input.invitationId },
      { name: "organization_invite", value: "1" },
    ],
    text,
    to: input.to,
  };
}

export async function queueOrganizationInviteEmail(
  input: {
    actorUserId: string;
    email: string;
    invitationId: string;
    orgId: string;
    orgName: string;
    role: string;
  },
  dependencies: {
    acceptUrl: () => string;
    queue: (value: {
      payload: ReturnType<typeof organizationInviteMessage>;
      principal: {
        actorUserId: string;
        apiKeyId: null;
        environment: "live";
        orgId: string;
      };
    }) => Promise<{ id: string }>;
    readyDomains: () => Promise<readonly string[]>;
  },
): Promise<{ id: string }> {
  const domain = selectInviteSendingDomain(
    await dependencies.readyDomains(),
    input.email,
  );
  if (!domain) {
    throw new OrganizationInviteEmailError("SENDER_UNAVAILABLE");
  }

  return dependencies.queue({
    payload: organizationInviteMessage({
      acceptUrl: dependencies.acceptUrl(),
      from: organizationInviteFromAddress(domain),
      invitationId: input.invitationId,
      orgName: input.orgName,
      role: input.role,
      to: input.email,
    }),
    principal: {
      actorUserId: input.actorUserId,
      apiKeyId: null,
      environment: "live",
      orgId: input.orgId,
    },
  });
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
