export const ORGANIZATION_INVITATION_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isOrganizationInvitationId(
  value: unknown,
): value is string {
  return (
    typeof value === "string" && ORGANIZATION_INVITATION_ID_PATTERN.test(value)
  );
}

export function organizationInvitePath(invitationId: string): string {
  if (!isOrganizationInvitationId(invitationId)) {
    throw new Error("INVALID_INVITATION_ID");
  }

  return `/invite/${invitationId}`;
}

export function safeAuthCallbackPath(value: unknown): string {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//")) {
    return "/app";
  }

  const [path] = value.split(/[?#]/);
  if (
    path !== "/app" &&
    !path.startsWith("/app/") &&
    !path.startsWith("/invite/")
  ) {
    return "/app";
  }

  return value;
}
