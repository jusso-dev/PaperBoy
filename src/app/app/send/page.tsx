import type { Metadata } from "next";
import Link from "next/link";
import { sendTestEmailAction } from "./actions";
import { can } from "@/lib/authorization";
import { listDomains } from "@/lib/domains";
import { MessageStatusError } from "@/lib/message-status-core";
import { getMessageDeliveryStatus } from "@/lib/message-statuses";
import { getOutboundProviderSettings } from "@/lib/outbound-providers";
import { readySenderDomains } from "@/lib/provider-sender-identities";
import { requireOrganization } from "@/lib/session";
import { formatDateTime } from "@/lib/time";

export const metadata: Metadata = {
  title: "Send test email · PaperBoy",
};

type SendPageProps = {
  searchParams: Promise<{
    error?: string;
    queued?: string;
  }>;
};

async function queuedMessage(input: {
  actorUserId: string;
  messageId: string | undefined;
  orgId: string;
}) {
  if (!input.messageId) return null;

  try {
    return await getMessageDeliveryStatus({
      actorUserId: input.actorUserId,
      environment: "live",
      messageId: input.messageId,
      orgId: input.orgId,
    });
  } catch (error) {
    if (error instanceof MessageStatusError) return null;
    throw error;
  }
}

export default async function Send({ searchParams }: SendPageProps) {
  const [{ organization, session }, status] = await Promise.all([
    requireOrganization(),
    searchParams,
  ]);
  const canSend = can(organization.role, "messages.send");
  const [domains, outboundProviders, sent] = canSend
    ? await Promise.all([
        listDomains({
          actorUserId: session.user.id,
          orgId: organization.id,
        }),
        getOutboundProviderSettings({
          actorUserId: session.user.id,
          orgId: organization.id,
        }),
        queuedMessage({
          actorUserId: session.user.id,
          messageId: status.queued,
          orgId: organization.id,
        }),
      ])
    : [[], null, null];
  let providerIdentityError = false;
  let readyDomains: string[] = [];
  if (outboundProviders) {
    try {
      readyDomains = await readySenderDomains({
        defaultProvider: outboundProviders.defaultProvider,
        domains,
        orgId: organization.id,
        providerDomains: outboundProviders.domains,
      });
    } catch {
      providerIdentityError = true;
    }
  }

  return (
    <section>
      <h1 className="page-title">Send a test email</h1>
      <p className="page-sub">
        Compose one live-provider check for {organization.name}. Queue and
        delivery times use <code>{session.user.timezone}</code>.
      </p>

      {status.error ? (
        <p className="form-error" role="alert">
          {status.error}
        </p>
      ) : null}
      {sent ? (
        <div className="form-success" role="status">
          <p>
            Test email <code>{sent.id}</code> entered the live queue at{" "}
            {formatDateTime(sent.createdAt, session.user.timezone)}. Current
            state: <strong>{sent.status}</strong>.
          </p>
          <p>
            <Link href="/app/logs">Open Delivery</Link> for its worker outcome.
          </p>
        </div>
      ) : null}

      {!canSend ? (
        <div className="card">
          <h2>Sending unavailable</h2>
          <p>
            Your role can inspect delivery records but cannot queue email.
            Owners and admins can send provider tests.
          </p>
        </div>
      ) : readyDomains.length === 0 ? (
        <div className="card">
          <h2>No provider-ready sender identity</h2>
          <p>
            {providerIdentityError
              ? "Amazon SES identity lookup failed. Test the provider connection for details."
              : "No verified sender identity was returned by the active email provider."}
          </p>
          <p className="card-actions">
            <Link className="btn btn-primary" href="/app/organization">
              Open outbound providers
            </Link>
          </p>
        </div>
      ) : (
        <form action={sendTestEmailAction} className="card send-compose-form">
          <div className="send-envelope-grid">
            <div className="field">
              <label htmlFor="send-domain">From domain</label>
              <select defaultValue="" id="send-domain" name="fromDomain" required>
                <option disabled value="">
                  Choose a verified domain
                </option>
                {readyDomains.map((domain) => (
                  <option key={domain} value={domain}>
                    {domain} · test@{domain}
                  </option>
                ))}
              </select>
              <p className="field-help">
                PaperBoy uses the sender name PaperBoy and local part test.
              </p>
            </div>
            <div className="field">
              <label htmlFor="send-to">To</label>
              <input
                autoCapitalize="none"
                autoComplete="email"
                id="send-to"
                name="to"
                placeholder="reader@example.com"
                required
                spellCheck={false}
                type="email"
              />
              <p className="field-help">One recipient for this provider check.</p>
            </div>
          </div>

          <div className="field">
            <label htmlFor="send-subject">Subject</label>
            <input
              defaultValue="PaperBoy test email"
              id="send-subject"
              maxLength={998}
              name="subject"
              required
              type="text"
            />
          </div>

          <div className="send-body-grid">
            <div className="field">
              <label htmlFor="send-html">HTML</label>
              <textarea
                defaultValue="<p>PaperBoy test email.</p>"
                id="send-html"
                name="html"
                rows={10}
                spellCheck={false}
              />
              <p className="field-help">Optional raw HTML. No rich-text editor.</p>
            </div>
            <div className="field">
              <label htmlFor="send-text">Plain text</label>
              <textarea
                defaultValue="PaperBoy test email."
                id="send-text"
                name="text"
                rows={10}
              />
              <p className="field-help">
                Include HTML, plain text, or both.
              </p>
            </div>
          </div>

          <div className="send-submit-row">
            <p>
              This enters the live queue. Local development delivers through
              Mailpit; a Cloudflare Email Service worker uses the same path.
            </p>
            <button className="btn btn-primary" type="submit">
              Send test email
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
