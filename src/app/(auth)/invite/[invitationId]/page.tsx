import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth-form";
import { findOrganizationInvitationById } from "@/lib/organizations";
import { organizationInvitePath } from "@/lib/organization-invite-access";
import { getSession } from "@/lib/session";
import { acceptInvitationFromLinkAction } from "./actions";

export const metadata: Metadata = {
  title: "Accept invitation · PaperBoy",
};

type InvitePageProps = {
  params: Promise<{ invitationId: string }>;
  searchParams: Promise<{ error?: string; mode?: string }>;
};

export default async function InvitePage({
  params,
  searchParams,
}: InvitePageProps) {
  const [{ invitationId }, status, session] = await Promise.all([
    params,
    searchParams,
    getSession(),
  ]);
  const invitation = await findOrganizationInvitationById(invitationId);

  if (!invitation || invitation.revokedAt) {
    return (
      <section className="auth-card">
        <p className="auth-kicker">Invitation</p>
        <h1>This invitation is no longer available</h1>
        <p className="auth-intro">
          Ask an owner or admin to send a new PaperBoy invitation to your
          email address.
        </p>
      </section>
    );
  }

  const invitePath = organizationInvitePath(invitation.id);
  const sessionEmail = session?.user.email.trim().toLowerCase() ?? null;
  const invitedEmail = invitation.email;
  const matchingSession = sessionEmail === invitedEmail;

  if (invitation.acceptedAt) {
    if (matchingSession) {
      redirect("/app");
    }

    return (
      <section className="auth-card">
        <p className="auth-kicker">Invitation</p>
        <h1>This invitation has already been accepted</h1>
        <p className="auth-intro">
          Sign in with {invitedEmail} if you already joined {invitation.orgName}.
        </p>
      </section>
    );
  }

  if (matchingSession) {
    return (
      <section className="auth-card">
        <p className="auth-kicker">Invitation</p>
        <h1>Join {invitation.orgName}</h1>
        <p className="auth-intro">
          You were invited as {invitation.role}. Accept to make this your
          active organization.
        </p>
        {status.error === "unavailable" ? (
          <p className="form-error" role="alert">
            That invitation is no longer available.
          </p>
        ) : null}
        <form action={acceptInvitationFromLinkAction}>
          <input name="invitationId" type="hidden" value={invitation.id} />
          <button className="btn btn-primary auth-submit" type="submit">
            Accept invitation
          </button>
        </form>
      </section>
    );
  }

  if (session) {
    return (
      <section className="auth-card">
        <p className="auth-kicker">Invitation</p>
        <h1>Wrong account</h1>
        <p className="auth-intro">
          This invitation was sent to {invitedEmail}. Sign out, then open the
          link again with that address.
        </p>
      </section>
    );
  }

  const mode = status.mode === "sign-in" ? "sign-in" : "sign-up";

  return (
    <AuthForm
      allowSignUp
      callbackURL={invitePath}
      defaultEmail={invitedEmail}
      intro={
        mode === "sign-up"
          ? `Create an account with ${invitedEmail} to join ${invitation.orgName} as ${invitation.role}.`
          : `Sign in with ${invitedEmail} to join ${invitation.orgName} as ${invitation.role}.`
      }
      lockEmail={mode === "sign-up"}
      mode={mode}
      switchHref={
        mode === "sign-up" ? `${invitePath}?mode=sign-in` : invitePath
      }
      title={`Join ${invitation.orgName}`}
    />
  );
}
