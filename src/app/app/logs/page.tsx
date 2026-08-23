import Link from "next/link";
import {
  MessageLogTable,
  type MessageLogRow,
} from "./message-log-table";
import { can } from "@/lib/authorization";
import { listDomains } from "@/lib/domains";
import { MESSAGE_STATUSES, type MessageStatus } from "@/lib/email-core";
import { getMessageDeliveryOverview } from "@/lib/message-statuses";
import { requireOrganization } from "@/lib/session";
import {
  formatDateTime,
  startOfCalendarDate,
  startOfNextCalendarDate,
} from "@/lib/time";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type LogsPageProps = {
  searchParams: Promise<{
    domain?: string;
    from?: string;
    status?: string;
    to?: string;
  }>;
};

function messageStatus(value: string | undefined): MessageStatus | undefined {
  return MESSAGE_STATUSES.includes(value as MessageStatus)
    ? (value as MessageStatus)
    : undefined;
}

function eventTime(
  message: Awaited<
    ReturnType<typeof getMessageDeliveryOverview>
  >["messages"][number],
) {
  if (message.status === "sent") return message.sentAt;
  if (message.status === "failed") return message.failedAt;
  if (message.status === "sending") return message.leaseExpiresAt;
  return message.nextAttemptAt;
}

function eventLabel(status: string): string {
  if (status === "sent") return "Sent";
  if (status === "failed") return "Failed";
  if (status === "sending") return "Lease expires";
  return "Next attempt";
}

export default async function Logs({ searchParams }: LogsPageProps) {
  const [{ organization, session }, query] = await Promise.all([
    requireOrganization(),
    searchParams,
  ]);
  const canRead = can(organization.role, "messages.read");

  if (!canRead) {
    return (
      <section>
        <h1 className="page-title">Delivery</h1>
        <p className="page-sub">
          Durable queue and worker outcomes. Times use{" "}
          <code>{session.user.timezone}</code>.
        </p>
        <p className="empty-state">Your role cannot read delivery status.</p>
      </section>
    );
  }

  const status = messageStatus(query.status);
  const domainId =
    typeof query.domain === "string" && UUID_PATTERN.test(query.domain)
      ? query.domain
      : undefined;
  let createdAtFrom = query.from
    ? startOfCalendarDate(query.from, session.user.timezone)
    : null;
  let createdAtBefore = query.to
    ? startOfNextCalendarDate(query.to, session.user.timezone)
    : null;
  const filterErrors: string[] = [];

  if (query.status && !status) filterErrors.push("Choose a valid status.");
  if (query.domain && !domainId) filterErrors.push("Choose a valid domain.");
  if (query.from && !createdAtFrom) filterErrors.push("Choose a valid start date.");
  if (query.to && !createdAtBefore) filterErrors.push("Choose a valid end date.");
  if (
    createdAtFrom &&
    createdAtBefore &&
    createdAtFrom.getTime() >= createdAtBefore.getTime()
  ) {
    filterErrors.push("The end date must be on or after the start date.");
    createdAtFrom = null;
    createdAtBefore = null;
  }

  const [domains, overview] = await Promise.all([
    listDomains({
      actorUserId: session.user.id,
      orgId: organization.id,
    }),
    getMessageDeliveryOverview({
      actorUserId: session.user.id,
      createdAtBefore: createdAtBefore ?? undefined,
      createdAtFrom: createdAtFrom ?? undefined,
      domainId,
      limit: 50,
      orgId: organization.id,
      status,
    }),
  ]);
  const domainNames = new Map(domains.map((domain) => [domain.id, domain.name]));
  const selectedDomain = domainId && domainNames.has(domainId) ? domainId : "";
  if (domainId && !selectedDomain) {
    filterErrors.push("That domain is no longer available in this organisation.");
  }
  const rows: MessageLogRow[] = overview.messages.map((message) => {
    const stateTime = eventTime(message);
    return {
      attemptCount: message.attemptCount,
      createdAt: formatDateTime(message.createdAt, session.user.timezone),
      deliveryMode: message.deliveryMode,
      domainName: message.domainId
        ? (domainNames.get(message.domainId) ?? "Deleted domain")
        : message.deliveryMode === "test-sink"
          ? "Test sink"
          : "—",
      environment: message.environment,
      failureReason: message.failureReason,
      id: message.id,
      lastErrorCode: message.lastErrorCode,
      stateLabel: eventLabel(message.status),
      stateTime: stateTime
        ? formatDateTime(stateTime, session.user.timezone)
        : null,
      status: message.status,
    };
  });
  const hasFilters = Boolean(
    query.status || query.domain || query.from || query.to,
  );

  return (
    <section>
      <h1 className="page-title">Delivery</h1>
      <p className="page-sub">
        Durable queue and worker outcomes. Calendar filters and timestamps use{" "}
        <code>{session.user.timezone}</code>; storage remains UTC.
      </p>

      {filterErrors.length > 0 ? (
        <div className="form-error" role="alert">
          {filterErrors.map((error) => (
            <p key={error}>{error}</p>
          ))}
        </div>
      ) : null}

      <form className="card message-log-filters" method="get">
        <div className="field">
          <label htmlFor="log-status">Status</label>
          <select defaultValue={status ?? ""} id="log-status" name="status">
            <option value="">All statuses</option>
            {MESSAGE_STATUSES.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="log-domain">Domain</label>
          <select defaultValue={selectedDomain} id="log-domain" name="domain">
            <option value="">All domains</option>
            {domains.map((domain) => (
              <option key={domain.id} value={domain.id}>
                {domain.name}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="log-from">From date</label>
          <input
            defaultValue={createdAtFrom ? query.from : ""}
            id="log-from"
            name="from"
            type="date"
          />
        </div>
        <div className="field">
          <label htmlFor="log-to">To date</label>
          <input
            defaultValue={createdAtBefore ? query.to : ""}
            id="log-to"
            name="to"
            type="date"
          />
        </div>
        <div className="message-log-filter-actions">
          <button className="btn btn-primary" type="submit">
            Apply filters
          </button>
          {hasFilters ? <Link href="/app/logs">Clear</Link> : null}
        </div>
      </form>

      <dl className="delivery-counts">
        {MESSAGE_STATUSES.map((value) => (
          <div className={`delivery-count delivery-count-${value}`} key={value}>
            <dt>{value}</dt>
            <dd>{overview.counts[value]}</dd>
          </div>
        ))}
      </dl>

      <p className="message-log-result-count">
        Showing {rows.length} matching message{rows.length === 1 ? "" : "s"}
        {rows.length === 50 ? " · limited to the most recent 50" : ""}.
      </p>
      <MessageLogTable rows={rows} />
    </section>
  );
}
