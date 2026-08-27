import Link from "next/link";
import {
  createSuppressionAction,
  deleteSuppressionAction,
  importSuppressionsAction,
  updateSuppressionAction,
} from "./actions";
import { can } from "@/lib/authorization";
import { requireOrganization } from "@/lib/session";
import {
  isSuppressionReason,
  SUPPRESSION_REASONS,
  type SuppressionReason,
} from "@/lib/suppression-core";
import { listSuppressions } from "@/lib/suppressions";
import { formatDateTime } from "@/lib/time";

type SuppressionsPageProps = {
  searchParams: Promise<{
    created?: string;
    error?: string;
    query?: string;
    reason?: string;
    saved?: string;
    unchanged?: string;
    updated?: string;
  }>;
};

const reasonLabels: Record<SuppressionReason, string> = {
  bounced: "Permanent bounce",
  complained: "Complaint",
  manual: "Manual",
  unsubscribed: "Unsubscribed",
};

function safeCount(value: string | undefined): number {
  return value && /^\d+$/.test(value) ? Number(value) : 0;
}

export default async function SuppressionsPage({
  searchParams,
}: SuppressionsPageProps) {
  const [{ organization, session }, status] = await Promise.all([
    requireOrganization(),
    searchParams,
  ]);
  const canManage = can(organization.role, "suppressions.manage");
  const canRead = can(organization.role, "suppressions.read");
  const reason = isSuppressionReason(status.reason) ? status.reason : null;
  const query = status.query?.trim() ?? "";
  const suppressions = canRead
    ? await listSuppressions({
        actorUserId: session.user.id,
        filter: { limit: 500, query, reason },
        orgId: organization.id,
      })
    : [];
  const savedMessage =
    status.saved === "created"
      ? "Address suppressed. New sends will stop before provider delivery."
      : status.saved === "updated"
        ? "Suppression updated."
        : status.saved === "deleted"
          ? "Suppression removed. The address may receive future mail."
          : status.saved === "imported"
            ? `CSV imported: ${safeCount(status.created)} created, ${safeCount(
                status.updated,
              )} strengthened, ${safeCount(status.unchanged)} unchanged.`
            : null;

  return (
    <section className="dashboard-wide">
      <h1 className="page-title">Suppressions</h1>
      <p className="page-sub">
        Organization blocklist for {organization.name}. The gate runs before
        SMTP or Cloudflare delivery. Times use <code>{session.user.timezone}</code>.
      </p>

      {savedMessage ? (
        <p className="form-success" role="status">
          {savedMessage}
        </p>
      ) : null}
      {status.error ? (
        <p className="form-error" role="alert">
          {status.error}
        </p>
      ) : null}

      <div className="card">
        <h2>Add address</h2>
        {canManage ? (
          <form action={createSuppressionAction} className="suppression-create-form">
            <div className="field">
              <label htmlFor="suppression-email">Email</label>
              <input
                autoComplete="off"
                id="suppression-email"
                maxLength={254}
                name="email"
                placeholder="reader@example.net"
                required
                type="email"
              />
            </div>
            <div className="field">
              <label htmlFor="suppression-reason">Reason</label>
              <select defaultValue="manual" id="suppression-reason" name="reason">
                {SUPPRESSION_REASONS.map((value) => (
                  <option key={value} value={value}>
                    {reasonLabels[value]}
                  </option>
                ))}
              </select>
            </div>
            <button className="btn btn-primary" type="submit">
              Suppress address
            </button>
          </form>
        ) : (
          <p>Owners and admins manage suppressions.</p>
        )}
      </div>

      <div className="card">
        <h2>Import CSV</h2>
        {canManage ? (
          <form
            action={importSuppressionsAction}
            className="suppression-import-form"
          >
            <div className="field">
              <label htmlFor="suppression-csv">CSV file</label>
              <input
                accept=".csv,text/csv"
                id="suppression-csv"
                name="csv"
                required
                type="file"
              />
              <p className="field-help">
                UTF-8, at most 1 MiB and 5,000 rows. Header: <code>email</code>
                {" "}with optional <code>reason</code>. Duplicate rows keep the
                strongest reason: complaint, then bounce, unsubscribe, then manual.
              </p>
            </div>
            <button className="btn" type="submit">
              Import suppressions
            </button>
          </form>
        ) : (
          <p>Owners and admins import suppressions.</p>
        )}
      </div>

      <div className="card">
        <div className="suppression-list-heading">
          <h2>Suppressed addresses</h2>
          <form className="suppression-filter-form" method="get">
            <div className="field">
              <label htmlFor="suppression-query">Search email</label>
              <input
                defaultValue={query}
                id="suppression-query"
                maxLength={254}
                name="query"
                placeholder="example.net"
                type="text"
              />
            </div>
            <div className="field">
              <label htmlFor="suppression-filter-reason">Reason</label>
              <select
                defaultValue={reason ?? ""}
                id="suppression-filter-reason"
                name="reason"
              >
                <option value="">All reasons</option>
                {SUPPRESSION_REASONS.map((value) => (
                  <option key={value} value={value}>
                    {reasonLabels[value]}
                  </option>
                ))}
              </select>
            </div>
            <button className="btn btn-compact" type="submit">
              Filter
            </button>
            {query || reason ? (
              <Link className="btn btn-compact" href="/app/suppressions">
                Clear
              </Link>
            ) : null}
          </form>
        </div>

        {!canRead ? (
          <p>Your role cannot read suppressions.</p>
        ) : (
          <div className="table-scroll">
            <table className="table suppression-table">
              <thead>
                <tr>
                  <th>Email</th>
                  <th>Reason</th>
                  <th>Created</th>
                  <th>Updated</th>
                  {canManage ? <th>Manage</th> : null}
                </tr>
              </thead>
              <tbody>
                {suppressions.length === 0 ? (
                  <tr>
                    <td colSpan={canManage ? 5 : 4}>
                      {query || reason
                        ? "No suppressions match these filters."
                        : "No suppressed addresses yet."}
                    </td>
                  </tr>
                ) : (
                  suppressions.map((suppression) => (
                    <tr key={suppression.id}>
                      <td>
                        {canManage ? (
                          <input
                            aria-label={`Email for ${suppression.email}`}
                            defaultValue={suppression.email}
                            form={`update-suppression-${suppression.id}`}
                            maxLength={254}
                            name="email"
                            required
                            type="email"
                          />
                        ) : (
                          suppression.email
                        )}
                      </td>
                      <td>
                        {canManage ? (
                          <select
                            aria-label={`Reason for ${suppression.email}`}
                            defaultValue={suppression.reason}
                            form={`update-suppression-${suppression.id}`}
                            name="reason"
                          >
                            {SUPPRESSION_REASONS.map((value) => (
                              <option key={value} value={value}>
                                {reasonLabels[value]}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <span className="pill pill-muted">
                            {reasonLabels[suppression.reason]}
                          </span>
                        )}
                      </td>
                      <td>
                        {formatDateTime(
                          suppression.createdAt,
                          session.user.timezone,
                        )}
                      </td>
                      <td>
                        {formatDateTime(
                          suppression.updatedAt,
                          session.user.timezone,
                        )}
                      </td>
                      {canManage ? (
                        <td>
                          <div className="table-manage-actions">
                            <form
                              action={updateSuppressionAction}
                              id={`update-suppression-${suppression.id}`}
                            >
                              <input
                                name="suppressionId"
                                type="hidden"
                                value={suppression.id}
                              />
                              <button className="btn btn-compact" type="submit">
                                Save
                              </button>
                            </form>
                            <form
                              action={deleteSuppressionAction}
                              className="suppression-delete-form"
                            >
                              <input
                                name="suppressionId"
                                type="hidden"
                                value={suppression.id}
                              />
                              <label className="confirmation-control">
                                <input
                                  name="confirm"
                                  required
                                  type="checkbox"
                                  value="yes"
                                />
                                Allow future mail
                              </label>
                              <button
                                className="btn btn-danger btn-compact"
                                type="submit"
                              >
                                Remove
                              </button>
                            </form>
                          </div>
                        </td>
                      ) : null}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
        {suppressions.length === 500 ? (
          <p className="field-help">
            Showing the newest 500 matches. Narrow the search to find older entries.
          </p>
        ) : null}
      </div>
    </section>
  );
}
