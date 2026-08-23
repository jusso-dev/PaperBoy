import {
  acceptInvitationAction,
  inviteMemberAction,
  removeMemberAction,
  switchOrganizationAction,
} from "./actions";
import { can, isOrgRole } from "@/lib/authorization";
import {
  listOrganizationInvitations,
  listOrganizationMembers,
  listPendingInvitationsForUser,
  listUserOrganizations,
} from "@/lib/organizations";
import { requireOrganization } from "@/lib/session";
import { formatDateTime } from "@/lib/time";

type OrganizationPageProps = {
  searchParams: Promise<{
    error?: string;
    saved?: string;
  }>;
};

const errorMessages: Record<string, string> = {
  already_member: "That person is already a member.",
  cannot_remove_owner: "The organization owner cannot be removed.",
  cannot_remove_self: "You cannot remove your own membership.",
  forbidden: "Your role does not allow that action.",
  invalid_email: "Enter a valid email address.",
  invalid_role: "Choose the admin or member role.",
  invitation_not_found: "That invitation is no longer available.",
  membership_required: "That organization membership is no longer available.",
};

const successMessages: Record<string, string> = {
  accepted: "Invitation accepted. The new organization is active.",
  invitation: "Invitation saved. The recipient can accept it in PaperBoy.",
  removed: "Member removed.",
};

export default async function OrganizationPage({
  searchParams,
}: OrganizationPageProps) {
  const [{ organization, session }, status] = await Promise.all([
    requireOrganization(),
    searchParams,
  ]);
  const [organizations, members, invitations, pendingInvitations] =
    await Promise.all([
      listUserOrganizations(session.user.id),
      listOrganizationMembers(organization.id),
      listOrganizationInvitations(organization.id),
      listPendingInvitationsForUser(session.user.email),
    ]);
  const canInvite = can(organization.role, "members.invite");
  const canRemove = can(organization.role, "members.remove");
  const errorMessage = status.error
    ? (errorMessages[status.error] ??
      "We could not complete that organization action. Try again.")
    : null;
  const successMessage = status.saved ? successMessages[status.saved] : null;

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
