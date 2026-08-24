import { unsubscribeAction } from "./actions";
import { PaperboyLogo } from "@/components/brand/paperboy-logo";
import {
  UnsubscribeConfigurationError,
  verifyUnsubscribeToken,
} from "@/lib/unsubscribe-core";

type Props = {
  searchParams: Promise<{ status?: string; token?: string }>;
};

export default async function UnsubscribePage({ searchParams }: Props) {
  const { status, token = "" } = await searchParams;
  let valid = false;
  try {
    valid = Boolean(token && verifyUnsubscribeToken({ token }));
  } catch (error) {
    if (!(error instanceof UnsubscribeConfigurationError)) throw error;
  }

  return (
    <main className="auth-shell">
      <section className="auth-card">
        <PaperboyLogo compact />
        <h1>Email preferences</h1>
        {status === "done" ? (
          <>
            <p className="form-success" role="status">
              You have been unsubscribed. PaperBoy blocked future organization
              sends before SMTP or Cloudflare delivery.
            </p>
            <p>No sign-in is required and no further action is needed.</p>
          </>
        ) : status === "invalid" || !valid ? (
          <p className="form-error" role="alert">
            This unsubscribe link is invalid or no longer available. Use the
            original link from the email or contact the sender.
          </p>
        ) : (
          <>
            <p>
              Confirm that you no longer want messages sent to this contact by
              the organization that emailed you.
            </p>
            <form action={unsubscribeAction}>
              <input name="token" type="hidden" value={token} />
              <button className="btn btn-primary" type="submit">
                Unsubscribe me
              </button>
            </form>
            <p className="field-help">
              Opening this page does not change your preference. Confirmation
              is required so email security scanners cannot unsubscribe you.
            </p>
          </>
        )}
      </section>
    </main>
  );
}
