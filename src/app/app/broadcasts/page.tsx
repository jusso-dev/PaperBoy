import {
  cancelBroadcastAction,
  pauseBroadcastAction,
  resumeBroadcastAction,
} from "./actions";
import { can } from "@/lib/authorization";
import { listBroadcasts } from "@/lib/broadcasts";
import { requireOrganization } from "@/lib/session";
import { formatDateTime } from "@/lib/time";

type BroadcastsPageProps = {
  searchParams: Promise<{ error?: string; success?: string }>;
};

const errorMessages: Record<string, string> = {
  forbidden: "Your role does not allow that broadcast operation.",
  "invalid-transition": "That broadcast can no longer make this state change.",
  "not-found": "That broadcast is no longer available.",
};

const successMessages: Record<string, string> = {
  cancel: "Broadcast cancelled. Pending recipients will not be queued.",
  pause: "Broadcast paused after its current recipient.",
  resume: "Broadcast resumed.",
};

export default async function BroadcastsPage({
  searchParams,
}: BroadcastsPageProps) {
  const [{ organization, session }, status] = await Promise.all([
    requireOrganization(),
    searchParams,
  ]);
  const canRead = can(organization.role, "broadcasts.read");
  const canControl = can(organization.role, "broadcasts.control");
  const records = canRead
    ? await listBroadcasts({
        actorUserId: session.user.id,
        orgId: organization.id,
      })
    : [];

  return (
    <section>
      <h1 className="page-title">Broadcasts</h1>
      <p className="page-sub">
        Send-now audience snapshots created through REST or MCP. Progress times
        use <code>{session.user.timezone}</code>.
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

      {!canRead ? (
        <p className="empty-state">Your role cannot read broadcasts.</p>
      ) : records.length === 0 ? (
        <p className="empty-state">
          No broadcasts yet. Use <code>POST /api/v1/broadcasts</code> or the
          MCP broadcast tool to send one template to up to 100 recipients.
        </p>
      ) : (
        <div className="broadcast-list">
          {records.map((record) => {
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
                  Started {formatDateTime(record.createdAt, session.user.timezone)} · updated{" "}
                  {formatDateTime(record.updatedAt, session.user.timezone)}
                </p>

                {canControl &&
                (record.status === "running" || record.status === "paused") ? (
                  <div className="broadcast-actions">
                    {record.status === "running" ? (
                      <form action={pauseBroadcastAction}>
                        <input name="broadcastId" type="hidden" value={record.id} />
                        <button className="btn btn-compact" type="submit">Pause</button>
                      </form>
                    ) : (
                      <form action={resumeBroadcastAction}>
                        <input name="broadcastId" type="hidden" value={record.id} />
                        <button className="btn btn-compact" type="submit">Resume</button>
                      </form>
                    )}
                    <form action={cancelBroadcastAction}>
                      <input name="broadcastId" type="hidden" value={record.id} />
                      <button className="btn btn-danger btn-compact" type="submit">
                        Cancel
                      </button>
                    </form>
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
