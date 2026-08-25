import {
  cancelBroadcastAction,
  createBroadcastAction,
  pauseBroadcastAction,
  resumeBroadcastAction,
} from "./actions";
import Link from "next/link";
import { can } from "@/lib/authorization";
import { listAudiences } from "@/lib/audiences";
import { listBroadcasts } from "@/lib/broadcasts";
import { listDomains } from "@/lib/domains";
import { getOutboundProviderSettings } from "@/lib/outbound-providers";
import { readySenderDomains } from "@/lib/provider-sender-identities";
import { requireOrganization } from "@/lib/session";
import { listTemplates } from "@/lib/templates";
import { formatDateTime } from "@/lib/time";
import { BROADCAST_STATUSES, type BroadcastStatus } from "@/lib/broadcast-core";

type BroadcastsPageProps = {
  searchParams: Promise<{ error?: string; status?: string; success?: string }>;
};

const errorMessages: Record<string, string> = {
  "audience-empty": "Choose an audience with at least one active subscribed contact.",
  "audience-not-found": "That audience is no longer available.",
  "consent-required": "Confirm recipient consent and sender identification before sending.",
  forbidden: "Your role does not allow that broadcast operation.",
  "invalid-schedule": "Choose one unambiguous future date and time.",
  "invalid-transition": "That broadcast can no longer make this state change.",
  "not-found": "That broadcast is no longer available.",
  "template-not-found": "That template is no longer available.",
  "unsubscribe-unavailable": "Public unsubscribe signing is not configured.",
  validation: "Check the broadcast name, sender, audience, template, and schedule.",
};

const successMessages: Record<string, string> = {
  cancel: "Broadcast cancelled. Pending recipients will not be queued.",
  created: "Broadcast created and queued.",
  pause: "Broadcast paused after its current recipient.",
  resume: "Broadcast resumed.",
  scheduled: "Broadcast scheduled.",
  updated: "Scheduled broadcast updated.",
};

export default async function BroadcastsPage({
  searchParams,
}: BroadcastsPageProps) {
  const [{ organization, session }, status] = await Promise.all([
    requireOrganization(),
    searchParams,
  ]);
  const canRead = can(organization.role, "broadcasts.read");
  const canCreate = can(organization.role, "broadcasts.create");
  const canControl = can(organization.role, "broadcasts.control");
  const [records, audiences, templates, domains, outboundProviders] = await Promise.all([
    canRead
      ? listBroadcasts({
          actorUserId: session.user.id,
          orgId: organization.id,
        })
      : [],
    canCreate
      ? listAudiences({
          actorUserId: session.user.id,
          orgId: organization.id,
        })
      : [],
    canCreate
      ? listTemplates({
          actorUserId: session.user.id,
          orgId: organization.id,
        })
      : [],
    canCreate
      ? listDomains({
          actorUserId: session.user.id,
          orgId: organization.id,
        })
      : [],
    canCreate
      ? getOutboundProviderSettings({
          actorUserId: session.user.id,
          orgId: organization.id,
        })
      : null,
  ]);
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
      readyDomains = [];
    }
  }
  const selectedStatus = BROADCAST_STATUSES.includes(status.status as BroadcastStatus)
    ? (status.status as BroadcastStatus)
    : "all";
  const visibleRecords = selectedStatus === "all"
    ? records
    : records.filter((record) => record.status === selectedStatus);

  return (
    <section>
      <h1 className="page-title">Broadcasts</h1>
      <p className="page-sub">
        Send now or schedule stored audience snapshots from console, REST, or MCP.
        Progress times use <code>{session.user.timezone}</code>.
      </p>

      {status.error ? (
        <p className="form-error" role="alert">
          {errorMessages[status.error] ?? "Broadcast operation failed."}
        </p>
      ) : null}
      {status.success ? (
        <p className="form-success" role="status">
          {successMessages[status.success] ?? "Broadcast updated."}
        </p>
      ) : null}

      <div className="card">
        <h2>Create broadcast</h2>
        {!canCreate ? (
          <p>Owners and admins create broadcasts.</p>
        ) : audiences.length === 0 || templates.length === 0 || readyDomains.length === 0 ? (
          <p>
            Create an audience and template first. Sender identities come from
            the configured email provider; PaperBoy does not onboard domains here.
          </p>
        ) : (
          <form action={createBroadcastAction} className="template-form">
            <div className="field">
              <label htmlFor="broadcast-name">Broadcast name</label>
              <input id="broadcast-name" maxLength={120} name="name" required />
            </div>
            <div className="send-envelope-grid">
              <div className="field">
                <label htmlFor="broadcast-audience">Audience</label>
                <select id="broadcast-audience" name="audienceId" required>
                  {audiences.map((audience) => (
                    <option key={audience.id} value={audience.id}>
                      {audience.name} · {audience.activeContactCount} active
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="broadcast-template">Template</label>
                <select id="broadcast-template" name="templateId" required>
                  {templates.map((template) => (
                    <option key={template.id} value={template.id}>
                      {template.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="field">
              <label htmlFor="broadcast-from">From address</label>
              <input
                autoCapitalize="none"
                id="broadcast-from"
                list="broadcast-sender-identities"
                name="from"
                placeholder={`news@${readyDomains[0] ?? "example.com"}`}
                required
                spellCheck={false}
                type="email"
              />
              <datalist id="broadcast-sender-identities">
                {readyDomains.map((domain) => (
                  <option key={domain} value={`news@${domain}`} />
                ))}
              </datalist>
              <p className="field-help">
                Domain must be a verified sender identity in the active provider.
              </p>
            </div>
            <fieldset className="field">
              <legend>Delivery</legend>
              <label>
                <input defaultChecked name="delivery" type="radio" value="now" /> Send now
              </label>
              <label>
                <input name="delivery" type="radio" value="scheduled" /> Schedule
              </label>
              <input
                aria-label={`Scheduled time in ${session.user.timezone}`}
                name="scheduledLocal"
                type="datetime-local"
              />
              <p className="field-help">
                Schedule interpreted as <code>{session.user.timezone}</code>.
              </p>
            </fieldset>
            <label className="confirmation-control">
              <input name="consentConfirmed" required type="checkbox" value="yes" />{" "}
              Recipients consented, and template identifies sender with current contact details.
            </label>
            <p className="field-help">
              PaperBoy adds a public signed unsubscribe link and suppresses opted-out recipients.
            </p>
            <button className="btn btn-primary" type="submit">
              Create broadcast
            </button>
          </form>
        )}
      </div>

      {canRead && records.length > 0 ? (
        <form className="broadcast-filter" method="get">
          <div className="field">
            <label htmlFor="broadcast-status-filter">Filter by status</label>
            <select
              defaultValue={selectedStatus}
              id="broadcast-status-filter"
              name="status"
            >
              <option value="all">All statuses</option>
              {BROADCAST_STATUSES.map((broadcastStatus) => (
                <option key={broadcastStatus} value={broadcastStatus}>
                  {broadcastStatus.charAt(0).toUpperCase() + broadcastStatus.slice(1)}
                </option>
              ))}
            </select>
          </div>
          <button className="btn btn-compact" type="submit">Apply filter</button>
        </form>
      ) : null}

      {!canRead ? (
        <p className="empty-state">Your role cannot read broadcasts.</p>
      ) : records.length === 0 ? (
        <p className="empty-state">
          No broadcasts yet. Create one above, use <code>POST /api/v1/broadcasts</code>,
          or use the MCP broadcast tool.
        </p>
      ) : visibleRecords.length === 0 ? (
        <p className="empty-state">
          No {selectedStatus} broadcasts. <Link href="/app/broadcasts">Clear filter</Link>.
        </p>
      ) : (
        <div className="broadcast-list">
          {visibleRecords.map((record) => {
            const complete =
              record.progress.queued +
              record.progress.suppressed +
              record.progress.failed +
              record.progress.cancelled;
            const percentage = Math.round(
              (complete / Math.max(record.progress.total, 1)) * 100,
            );

            return (
              <article className="card broadcast-card" key={record.id}>
                <div className="broadcast-heading">
                  <div>
                    <h2>{record.name}</h2>
                    <p>
                      {record.templateName} · {record.environment}
                    </p>
                  </div>
                  <span
                    className={`pill ${record.status === "completed" ? "pill-accent" : "pill-muted"}`}
                  >
                    {record.status}
                  </span>
                </div>

                <div
                  aria-label={`${complete} of ${record.progress.total} recipients complete`}
                  aria-valuemax={record.progress.total}
                  aria-valuemin={0}
                  aria-valuenow={complete}
                  className="broadcast-progress"
                  role="progressbar"
                >
                  <span style={{ width: `${percentage}%` }} />
                </div>

                <dl className="broadcast-counts">
                  <div><dt>Total</dt><dd>{record.progress.total}</dd></div>
                  <div><dt>Queued</dt><dd>{record.progress.queued}</dd></div>
                  <div><dt>Suppressed</dt><dd>{record.progress.suppressed}</dd></div>
                  <div><dt>Failed</dt><dd>{record.progress.failed}</dd></div>
                  <div><dt>Cancelled</dt><dd>{record.progress.cancelled}</dd></div>
                </dl>

                <p className="template-meta">
                  {record.scheduledFor
                    ? `Scheduled ${formatDateTime(record.scheduledFor, session.user.timezone)}`
                    : `Started ${formatDateTime(record.createdAt, session.user.timezone)}`} · updated{" "}
                  {formatDateTime(record.updatedAt, session.user.timezone)}
                </p>

                <div className="broadcast-actions">
                  <Link
                    className="btn btn-compact"
                    href={`/app/broadcasts/${record.id}/preview`}
                  >
                    Open broadcast
                  </Link>
                  {canControl &&
                  (record.status === "scheduled" ||
                    record.status === "running" ||
                    record.status === "paused") ? (
                    <>
                    {record.status === "running" ? (
                      <form action={pauseBroadcastAction}>
                        <input name="broadcastId" type="hidden" value={record.id} />
                        <button className="btn btn-compact" type="submit">Pause</button>
                      </form>
                    ) : record.status === "paused" ? (
                      <form action={resumeBroadcastAction}>
                        <input name="broadcastId" type="hidden" value={record.id} />
                        <button className="btn btn-compact" type="submit">Resume</button>
                      </form>
                    ) : null}
                    <form action={cancelBroadcastAction}>
                      <input name="broadcastId" type="hidden" value={record.id} />
                      <button className="btn btn-danger btn-compact" type="submit">
                        Cancel
                      </button>
                    </form>
                    </>
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
