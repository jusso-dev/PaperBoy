export const ORG_ROLES = ["owner", "admin", "member"] as const;

export type OrgRole = (typeof ORG_ROLES)[number];

export const ORG_PERMISSIONS = [
  "apiKeys.create",
  "apiKeys.read",
  "apiKeys.revoke",
  "broadcasts.control",
  "broadcasts.create",
  "broadcasts.read",
  "audiences.manage",
  "audiences.read",
  "domains.create",
  "domains.delete",
  "domains.manageDkim",
  "domains.read",
  "domains.verify",
  "feedback.ingest",
  "members.invite",
  "members.remove",
  "members.read",
  "messages.downloadMime",
  "messages.read",
  "messages.send",
  "openTracking.manage",
  "openTracking.read",
  "outboundProviders.manage",
  "outboundProviders.read",
  "rateLimits.manage",
  "rateLimits.read",
  "suppressions.manage",
  "suppressions.read",
  "templates.create",
  "templates.delete",
  "templates.read",
  "templates.update",
  "webhooks.manage",
  "webhooks.read",
] as const;

export type OrgPermission = (typeof ORG_PERMISSIONS)[number];

const rolePermissions: Record<OrgRole, ReadonlySet<OrgPermission>> = {
  owner: new Set(ORG_PERMISSIONS),
  admin: new Set([
    "apiKeys.create",
    "apiKeys.read",
    "apiKeys.revoke",
    "broadcasts.control",
    "broadcasts.create",
    "broadcasts.read",
    "audiences.manage",
    "audiences.read",
    "domains.create",
    "domains.delete",
    "domains.manageDkim",
    "domains.read",
    "domains.verify",
    "feedback.ingest",
    "members.invite",
    "members.read",
    "messages.read",
    "messages.send",
    "openTracking.manage",
    "openTracking.read",
    "outboundProviders.manage",
    "outboundProviders.read",
    "rateLimits.manage",
    "rateLimits.read",
    "suppressions.manage",
    "suppressions.read",
    "templates.create",
    "templates.delete",
    "templates.read",
    "templates.update",
    "webhooks.manage",
    "webhooks.read",
  ]),
  member: new Set([
    "audiences.read",
    "broadcasts.read",
    "domains.read",
    "members.read",
    "messages.read",
    "openTracking.read",
    "outboundProviders.read",
    "rateLimits.read",
    "suppressions.read",
    "templates.read",
  ]),
};

export class AuthorizationError extends Error {
  readonly code = "FORBIDDEN";

  constructor(permission: OrgPermission) {
    super(`Role does not grant ${permission}`);
    this.name = "AuthorizationError";
  }
}

export function isOrgRole(value: unknown): value is OrgRole {
  return typeof value === "string" && ORG_ROLES.includes(value as OrgRole);
}

export function can(role: OrgRole, permission: OrgPermission): boolean {
  return rolePermissions[role].has(permission);
}

export function requirePermission(
  role: OrgRole,
  permission: OrgPermission,
): void {
  if (!can(role, permission)) {
    throw new AuthorizationError(permission);
  }
}
