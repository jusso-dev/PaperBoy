import {
  acceptInvitationAction,
  inviteMemberAction,
  renameOrganizationAction,
  removeMemberAction,
  switchOrganizationAction,
  testOutboundProviderAction,
  updateDefaultOutboundProviderAction,
  updateOpenTrackingAction,
  updateRateLimitsAction,
} from "./actions";
import { can, isOrgRole } from "@/lib/authorization";
import {
  listOrganizationInvitations,
  listOrganizationMembers,
  listPendingInvitationsForUser,
  listUserOrganizations,
} from "@/lib/organizations";
import { requireOrganization } from "@/lib/session";
import { normalizeSendingDomain } from "@/lib/domain-core";
import { getOpenTrackingSettings } from "@/lib/open-tracking";
import {
  openTrackingPublicUrl,
  parseOpenTrackingSigningKey,
} from "@/lib/open-tracking-core";
import { getOutboundProviderSettings } from "@/lib/outbound-providers";
import { getRateLimitSettings } from "@/lib/rate-limits";
import { formatDateTime } from "@/lib/time";

type OrganizationPageProps = {
  searchParams: Promise<{
    error?: string;
    providerDomainCount?: string;
    providerDomains?: string;
    providerMode?: string;
    providerRegion?: string;
    providerSending?: string;
    saved?: string;
  }>;
};

const errorMessages: Record<string, string> = {
  already_member: "That person is already a member.",
  cannot_remove_owner: "The organization owner cannot be removed.",
  cannot_remove_self: "You cannot remove your own membership.",
  forbidden: "Your role does not allow that action.",
  invalid_email: "Enter a valid email address.",
  invalid_name: "Enter an organization name of at most 120 characters.",
  invalid_role: "Choose the admin or member role.",
  invalid_rate_limits:
    "Use whole-number limits, with the test limit higher than the live limit.",
  invalid_open_tracking: "Choose whether open tracking is enabled.",
  invalid_provider_settings: "Choose a supported outbound provider.",
  invitation_not_found: "That invitation is no longer available.",
  membership_required: "That organization membership is no longer available.",
  open_tracking_configuration:
    "The operator must configure the public URL and dedicated open-tracking signing key before tracking can be enabled.",
  provider_adapter_unavailable:
    "That provider is selectable, but this PaperBoy build does not include its delivery adapter yet.",
  provider_configuration_invalid:
    "The operator must correct that provider's secret-store configuration.",
  provider_connection_failed:
    "The provider did not accept the connection test.",
  provider_credentials_missing:
    "The operator must add that provider's credentials to the PaperBoy secret store.",
  provider_domain_not_found:
    "That sending domain is no longer available in this organisation.",
  rate_limit_configuration:
    "The operator must correct the configured live and test rate-limit defaults.",
};

const successMessages: Record<string, string> = {
  accepted: "Invitation accepted. The new organization is active.",
  invitation: "Invitation saved. The recipient can accept it in PaperBoy.",
  removed: "Member removed.",
  renamed: "Organization renamed.",
  "rate-limits": "Organization rate limits saved.",
  "open-tracking": "Organization open-tracking setting saved.",
  "outbound-provider": "Organisation default outbound provider saved.",
  "domain-provider": "Domain outbound-provider override saved.",
  "provider-tested": "Provider connection test passed.",
};

export default async function OrganizationPage({
  searchParams,
}: OrganizationPageProps) {
  const [{ organization, session }, status] = await Promise.all([
    requireOrganization(),
    searchParams,
  ]);
  const [
    organizations,
    members,
    invitations,
    pendingInvitations,
    rateLimits,
    openTracking,
    outboundProviders,
  ] = await Promise.all([
      listUserOrganizations(session.user.id),
      listOrganizationMembers(organization.id),
      listOrganizationInvitations(organization.id),
      listPendingInvitationsForUser(session.user.email),
      getRateLimitSettings({
        actorUserId: session.user.id,
        orgId: organization.id,
      }),
      getOpenTrackingSettings({
        actorUserId: session.user.id,
        orgId: organization.id,
      }),
      getOutboundProviderSettings({
        actorUserId: session.user.id,
        orgId: organization.id,
      }),
    ]);
  const canInvite = can(organization.role, "members.invite");
  const canRename = can(organization.role, "organizations.rename");
  const canRemove = can(organization.role, "members.remove");
  const canManageRateLimits = can(organization.role, "rateLimits.manage");
  const canManageOpenTracking = can(
    organization.role,
    "openTracking.manage",
  );
  const canManageOutboundProviders = can(
    organization.role,
    "outboundProviders.manage",
  );
  const errorMessage = status.error
    ? (errorMessages[status.error] ??
      "We could not complete that organization action. Try again.")
    : null;
  const testedSesMode =
    status.saved === "provider-tested" &&
    (status.providerMode === "sandbox" || status.providerMode === "production") &&
    typeof status.providerRegion === "string" &&
    /^[a-z]{2}(?:-[a-z0-9]+)+-[0-9]$/.test(status.providerRegion)
      ? status.providerMode
      : null;
  const testedSesDomainCount =
    testedSesMode &&
    typeof status.providerDomainCount === "string" &&
    /^\d{1,6}$/.test(status.providerDomainCount)
      ? Number(status.providerDomainCount)
      : null;
  const testedSesDomains =
    testedSesDomainCount !== null && typeof status.providerDomains === "string"
      ? status.providerDomains
          .split(",")
          .slice(0, 20)
          .map(normalizeSendingDomain)
          .filter((domain): domain is string => Boolean(domain))
      : [];
  const testedSesDomainSummary =
    testedSesDomainCount === null
      ? ""
      : testedSesDomainCount === 0
        ? " No verified sending domains were found."
        : ` Verified domains (${testedSesDomainCount}): ${testedSesDomains.join(", ")}${
            testedSesDomainCount > testedSesDomains.length ? ", …" : ""
          }.`;
  const successMessage = testedSesMode
    ? `Amazon SES connection passed in ${status.providerRegion}: ${testedSesMode} access, sending ${
        status.providerSending === "true" ? "enabled" : "disabled"
      }.${testedSesDomainSummary}`
    : status.saved
      ? successMessages[status.saved]
      : null;
  let openTrackingOrigin: string | null = null;
  try {
    parseOpenTrackingSigningKey();
    openTrackingOrigin = openTrackingPublicUrl().origin;
  } catch {
    openTrackingOrigin = null;
  }

  return (
    <section>
      <h1 className="page-title">Organization</h1>
      <p className="page-sub">
        Membership and permissions for {organization.name}.
      </p>

      {successMessage ? (
        <p className="form-success" role="status">
          {successMessage}
        </p>
      ) : null}
      {errorMessage ? (
        <p className="form-error" role="alert">
          {errorMessage}
        </p>
      ) : null}

      {pendingInvitations.length > 0 ? (
        <div className="card invitation-card">
          <h2>Invitations for you</h2>
          {pendingInvitations.map((invitation) => (
            <div className="invitation-row" key={invitation.id}>
              <p>
                <strong>{invitation.orgName}</strong>
                <br />
                Role: {invitation.role}
              </p>
              <form action={acceptInvitationAction}>
                <input
                  name="invitationId"
                  type="hidden"
                  value={invitation.id}
                />
                <button className="btn btn-primary" type="submit">
                  Accept invitation
                </button>
              </form>
            </div>
          ))}
        </div>
      ) : null}

      <div className="card organization-summary">
        <h2>Active organization</h2>
        <div className="organization-heading">
          <div>
            <p className="organization-name">{organization.name}</p>
            <span className="pill pill-accent">{organization.role}</span>
          </div>
          {organizations.length > 1 ? (
            <form action={switchOrganizationAction} className="organization-switcher">
              <label htmlFor="orgId">Switch organization</label>
              <div className="inline-form">
                <select defaultValue={organization.id} id="orgId" name="orgId">
                  {organizations.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name} · {item.role}
                    </option>
                  ))}
                </select>
                <button className="btn" type="submit">
                  Switch
                </button>
              </div>
            </form>
          ) : null}
        </div>
        {canRename ? (
          <form action={renameOrganizationAction} className="rate-limit-form">
            <div className="field">
              <label htmlFor="organization-name">Organization name</label>
              <input
                defaultValue={organization.name}
                id="organization-name"
                maxLength={120}
                name="name"
                required
              />
            </div>
            <button className="btn btn-primary" type="submit">
              Save organization name
            </button>
          </form>
        ) : null}
      </div>

      <div className="card">
        <h2>Send rate limits</h2>
        <p>
          All API keys in this organization share one fixed UTC-minute window
          per environment. Test keys use the higher test cap. Updated {formatDateTime(
            rateLimits.updatedAt,
            session.user.timezone,
          )}.
        </p>
        <div className="rate-limit-summary">
          <div>
            <span>Live</span>
            <strong>{rateLimits.liveLimitPerMinute}/min</strong>
            <small>Default {rateLimits.defaultLiveLimitPerMinute}/min</small>
          </div>
          <div>
            <span>Test</span>
            <strong>{rateLimits.testLimitPerMinute}/min</strong>
            <small>Default {rateLimits.defaultTestLimitPerMinute}/min</small>
          </div>
        </div>
        {canManageRateLimits ? (
          <form action={updateRateLimitsAction} className="rate-limit-form">
            <div className="field">
              <label htmlFor="liveLimitPerMinute">Live override per minute</label>
              <input
                defaultValue={rateLimits.liveOverridePerMinute ?? ""}
                id="liveLimitPerMinute"
                max={1000000}
                min={1}
                name="liveLimitPerMinute"
                placeholder={String(rateLimits.defaultLiveLimitPerMinute)}
                type="number"
              />
              <p className="field-help">Leave blank to use the operator default.</p>
            </div>
            <div className="field">
              <label htmlFor="testLimitPerMinute">Test override per minute</label>
              <input
                defaultValue={rateLimits.testOverridePerMinute ?? ""}
                id="testLimitPerMinute"
                max={1000000}
                min={1}
                name="testLimitPerMinute"
                placeholder={String(rateLimits.defaultTestLimitPerMinute)}
                type="number"
              />
              <p className="field-help">Must remain higher than the effective live cap.</p>
            </div>
            <button className="btn btn-primary" type="submit">
              Save rate limits
            </button>
          </form>
        ) : (
          <p>Owners and admins manage rate limits.</p>
        )}
      </div>

      <div className="card">
        <h2>Outbound providers</h2>
        <p>
          Every live message snapshots one provider before entering the queue.
          The organisation default is <strong>{outboundProviders.providers.find(
            (provider) => provider.id === outboundProviders.defaultProvider,
          )?.label ?? outboundProviders.defaultProvider}</strong>. Changing it
          never reroutes existing messages. Updated {formatDateTime(
            outboundProviders.updatedAt,
            session.user.timezone,
          )}.
        </p>
        <p>
          Credentials stay in the operator secret store. PaperBoy never accepts
          or returns them through the console, REST API, or MCP. Cloudflare Email
          Service is selectable directly and uses its authenticated SMTP endpoint.
          Amazon SES supports per-organisation IAM roles or access keys and reports
          its regional sandbox or production mode when tested.
        </p>

        {canManageOutboundProviders ? (
          <form
            action={updateDefaultOutboundProviderAction}
            className="rate-limit-form"
          >
            <div className="field">
              <label htmlFor="default-outbound-provider">
                Organisation default
              </label>
              <select
                defaultValue={outboundProviders.defaultProvider}
                id="default-outbound-provider"
                name="provider"
              >
                {outboundProviders.providers.map((provider) => (
                  <option key={provider.id} value={provider.id}>
                    {provider.label}
                  </option>
                ))}
              </select>
            </div>
            <button className="btn btn-primary" type="submit">
              Save default provider
            </button>
          </form>
        ) : (
          <p>Owners and admins manage outbound providers.</p>
        )}

        <div className="table-scroll">
          <table className="table">
            <thead>
              <tr>
                <th>Provider</th>
                <th>Readiness</th>
                <th>Capabilities</th>
                {canManageOutboundProviders ? <th>Connection</th> : null}
              </tr>
            </thead>
            <tbody>
              {outboundProviders.providers.map((provider) => (
                <tr key={provider.id}>
                  <td>{provider.label}</td>
                  <td>
                    <span
                      className={`pill ${
                        provider.configured ? "pill-accent" : "pill-muted"
                      }`}
                    >
                      {provider.configured
                        ? provider.credentialScope === "organization"
                          ? "Organisation secret ready"
                          : "Operator default ready"
                        : provider.state === "adapter-unavailable"
                          ? "Adapter pending"
                          : provider.state === "configuration-invalid"
                            ? "Configuration invalid"
                            : "Credentials missing"}
                    </span>
                  </td>
                  <td>
                    {[
                      provider.capabilities.batch ? "batch" : "single",
                      provider.capabilities.events ? "events" : null,
                      provider.capabilities.scheduling ? "scheduling" : null,
                    ]
                      .filter(Boolean)
                      .join(", ")}
                  </td>
                  {canManageOutboundProviders ? (
                    <td>
                      <form action={testOutboundProviderAction}>
                        <input name="provider" type="hidden" value={provider.id} />
                        <button className="btn btn-compact" type="submit">
                          Test provider
                        </button>
                      </form>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="field-help">
          Sender-domain onboarding, DNS, SPF, and DKIM stay in the selected
          provider. PaperBoy only reports identities returned by provider tests.
        </p>
      </div>

      <div className="card">
        <h2>Open tracking</h2>
        <p>
          Privacy-first and off by default. When enabled, PaperBoy adds one
          signed first-party pixel to HTML messages and records at most one
          opened event. Security scanners and mail proxies can trigger it, so
          an event does not prove a person read the message. Updated {formatDateTime(
            openTracking.updatedAt,
            session.user.timezone,
          )}.
        </p>
        <p>
          Current setting: <strong>{openTracking.enabled ? "On" : "Off"}</strong>
        </p>
        <p>
          Operator configuration:{" "}
          <strong>{openTrackingOrigin ? "Ready" : "Unavailable"}</strong>
          {openTrackingOrigin ? ` for ${openTrackingOrigin}` : "."}
        </p>
        {canManageOpenTracking ? (
          <form action={updateOpenTrackingAction} className="rate-limit-form">
            <label htmlFor="openTrackingEnabled">
              <input
                defaultChecked={openTracking.enabled}
                disabled={!openTrackingOrigin}
                id="openTrackingEnabled"
                name="enabled"
                type="checkbox"
              />{" "}
              Add the PaperBoy open pixel to future HTML messages
            </label>
            <p className="field-help">
              Plain-text messages are never tracked. Existing queued messages
              keep the setting captured when they were created.
            </p>
            <button
              className="btn btn-primary"
              disabled={!openTrackingOrigin}
              type="submit"
            >
              Save open tracking
            </button>
            {!openTrackingOrigin ? (
              <p className="field-help">
                Public URL and signing key are deployment secrets managed in Coolify.
              </p>
            ) : null}
          </form>
        ) : (
          <p>Owners and admins manage open tracking.</p>
        )}
      </div>

      <div className="card">
        <h2>Members</h2>
        <div className="table-scroll">
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Joined</th>
                {canRemove ? <th>Action</th> : null}
              </tr>
            </thead>
            <tbody>
              {members.map((member) => {
                const role = isOrgRole(member.role) ? member.role : "member";
                const removable =
                  canRemove &&
                  role !== "owner" &&
                  member.userId !== session.user.id;

                return (
                  <tr key={member.id}>
                    <td>{member.name}</td>
                    <td>{member.email}</td>
                    <td>
                      <span className="pill pill-muted">{role}</span>
                    </td>
                    <td>
                      {formatDateTime(member.createdAt, session.user.timezone)}
                    </td>
                    {canRemove ? (
                      <td>
                        {removable ? (
                          <form action={removeMemberAction}>
                            <input
                              name="membershipId"
                              type="hidden"
                              value={member.id}
                            />
                            <button className="btn btn-compact" type="submit">
                              Remove
                            </button>
                          </form>
                        ) : (
                          "—"
                        )}
                      </td>
                    ) : null}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <h2>Invite by email</h2>
        {canInvite ? (
          <>
            <p>
              No email is sent in v1. The recipient sees the invitation after
              signing in with this address.
            </p>
            <form action={inviteMemberAction} className="invite-form">
              <div className="field">
                <label htmlFor="invite-email">Email</label>
                <input
                  autoComplete="email"
                  id="invite-email"
                  name="email"
                  required
                  type="email"
                />
              </div>
              <div className="field">
                <label htmlFor="invite-role">Role</label>
                <select defaultValue="member" id="invite-role" name="role">
                  <option value="member">Member</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              <button className="btn btn-primary" type="submit">
                Save invitation
              </button>
            </form>
          </>
        ) : (
          <p>Owners and admins manage invitations.</p>
        )}

        {invitations.length > 0 ? (
          <div className="pending-invitations">
            <h3>Pending</h3>
            <ul>
              {invitations.map((invitation) => (
                <li key={invitation.id}>
                  <span>{invitation.email}</span>
                  <span>
                    {invitation.role} · {formatDateTime(
                      invitation.createdAt,
                      session.user.timezone,
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </section>
  );
}
