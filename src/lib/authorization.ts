export const ORG_ROLES = ["owner", "admin", "member"] as const;

export type OrgRole = (typeof ORG_ROLES)[number];

export const ORG_PERMISSIONS = [
  "apiKeys.create",
  "apiKeys.read",
  "apiKeys.revoke",
  "domains.create",
  "domains.delete",
  "domains.manageDkim",
  "domains.read",
  "domains.verify",
  "members.invite",
  "members.remove",
  "members.read",
] as const;

export type OrgPermission = (typeof ORG_PERMISSIONS)[number];

const rolePermissions: Record<OrgRole, ReadonlySet<OrgPermission>> = {
  owner: new Set(ORG_PERMISSIONS),
  admin: new Set([
    "apiKeys.create",
    "apiKeys.read",
    "apiKeys.revoke",
    "domains.create",
    "domains.delete",
    "domains.manageDkim",
    "domains.read",
    "domains.verify",
    "members.invite",
    "members.read",
  ]),
  member: new Set(["domains.read", "members.read"]),
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
