import Link from "next/link";
import {
  MessageLogTable,
  type MessageLogRow,
} from "./message-log-table";
import { can } from "@/lib/authorization";
import { listDomains } from "@/lib/domains";
import { MESSAGE_STATUSES, type MessageStatus } from "@/lib/email-core";
import {
  MESSAGE_LOG_PAGE_SIZE,
  MESSAGE_LOG_SORTS,
  parseMessageLogOrder,
  parseMessageLogPage,
  parseMessageLogQuery,
  parseMessageLogSort,
  type MessageLogOrder,
  type MessageLogSort,
} from "@/lib/message-status-core";
import { getMessageDeliveryOverview } from "@/lib/message-statuses";
import { requireOrganization } from "@/lib/session";
import {
  formatDateTime,
  startOfCalendarDate,
  startOfNextCalendarDate,
} from "@/lib/time";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type LogsQuery = {
  domain?: string;
  from?: string;
  order?: string;
  page?: string;
  q?: string;
  sort?: string;
  status?: string;
  to?: string;
};

type LogsPageProps = {
  searchParams: Promise<LogsQuery>;
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

function logsHref(params: {
  domain?: string;
  from?: string;
  order?: MessageLogOrder;
  page?: number;
  q?: string;
  sort?: MessageLogSort;
  status?: string;
  to?: string;
}): string {
  const search = new URLSearchParams();
  if (params.q) search.set("q", params.q);
  if (params.status) search.set("status", params.status);
  if (params.domain) search.set("domain", params.domain);
  if (params.from) search.set("from", params.from);
  if (params.to) search.set("to", params.to);
  if (params.sort && params.sort !== "created") search.set("sort", params.sort);
  if (params.order && params.order !== "desc") search.set("order", params.order);
  if (params.page && params.page > 1) search.set("page", String(params.page));
  const query = search.toString();
  return query ? `/app/logs?${query}` : "/app/logs";
}

function nextOrder(
  currentSort: MessageLogSort,
  currentOrder: MessageLogOrder,
  nextSort: MessageLogSort,
): MessageLogOrder {
  if (currentSort === nextSort) return currentOrder === "asc" ? "desc" : "asc";
  return nextSort === "subject" || nextSort === "status" ? "asc" : "desc";
}

const SORT_LABELS: Record<MessageLogSort, string> = {
  attempts: "Attempts",
  created: "Queued time",
  status: "Status",
  subject: "Subject",
};

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
  const search = parseMessageLogQuery(query.q);
  const sort = parseMessageLogSort(query.sort);
  const order = parseMessageLogOrder(query.order);
  const requestedPage = parseMessageLogPage(query.page);
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

  const currentFilters = {
    domain: domainId,
    from: createdAtFrom ? query.from : undefined,
    order,
    q: search,
    sort,
    status,
    to: createdAtBefore ? query.to : undefined,
  };

  const overviewInput = {
    actorUserId: session.user.id,
    createdAtBefore: createdAtBefore ?? undefined,
    createdAtFrom: createdAtFrom ?? undefined,
    domainId,
    limit: MESSAGE_LOG_PAGE_SIZE,
    orgId: organization.id,
    query: search,
    sort,
    sortDirection: order,
    status,
  };
  const [domains, firstPage] = await Promise.all([
    listDomains({
      actorUserId: session.user.id,
      orgId: organization.id,
    }),
    getMessageDeliveryOverview({
      ...overviewInput,
      offset: (requestedPage - 1) * MESSAGE_LOG_PAGE_SIZE,
    }),
  ]);
  const totalPages = Math.max(
    1,
    Math.ceil(firstPage.total / MESSAGE_LOG_PAGE_SIZE),
  );
  const page = Math.min(requestedPage, totalPages);
  const overview =
    page === requestedPage
      ? firstPage
      : await getMessageDeliveryOverview({
          ...overviewInput,
          offset: (page - 1) * MESSAGE_LOG_PAGE_SIZE,
        });
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
      subject: message.subject,
      to: message.to,
      stateLabel: eventLabel(message.status),
      stateTime: stateTime
        ? formatDateTime(stateTime, session.user.timezone)
        : null,
      status: message.status,
    };
  });
  const hasFilters = Boolean(
    search || query.status || query.domain || query.from || query.to,
  );
  const rangeStart =
    overview.total === 0 ? 0 : (page - 1) * MESSAGE_LOG_PAGE_SIZE + 1;
  const rangeEnd = Math.min(page * MESSAGE_LOG_PAGE_SIZE, overview.total);
  const sortLinks = Object.fromEntries(
    MESSAGE_LOG_SORTS.map((key) => [
      key,
      logsHref({
        ...currentFilters,
        order: nextOrder(sort, order, key),
        sort: key,
      }),
    ]),
  ) as Record<MessageLogSort, string>;

  return (
    <section>
      <h1 className="page-title">Delivery</h1>
      <p className="page-sub">
        Durable queue and worker outcomes. Search, filter, and sort every
        matching message. Open a row to read the subject and body. Calendar
        filters and timestamps use <code>{session.user.timezone}</code>; storage
        remains UTC.
      </p>

      {filterErrors.length > 0 ? (
        <div className="form-error" role="alert">
          {filterErrors.map((error) => (
            <p key={error}>{error}</p>
          ))}
        </div>
      ) : null}

      <form className="card message-log-filters" method="get">
        <div className="field message-log-search">
          <label htmlFor="log-query">Search</label>
          <input
            defaultValue={search ?? ""}
            id="log-query"
            name="q"
            placeholder="Subject, recipient, or sender"
            type="search"
          />
        </div>
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
        <div className="field">
          <label htmlFor="log-sort">Sort</label>
          <select defaultValue={sort} id="log-sort" name="sort">
            {MESSAGE_LOG_SORTS.map((value) => (
              <option key={value} value={value}>
                {SORT_LABELS[value]}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="log-order">Order</label>
          <select defaultValue={order} id="log-order" name="order">
            <option value="desc">Newest / high first</option>
            <option value="asc">Oldest / low first</option>
          </select>
        </div>
        <div className="message-log-filter-actions">
          <button className="btn btn-primary" type="submit">
            Apply
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
        {overview.total === 0
          ? "No matching messages."
          : `Showing ${rangeStart}–${rangeEnd} of ${overview.total} matching message${overview.total === 1 ? "" : "s"}.`}
      </p>
      {overview.total > MESSAGE_LOG_PAGE_SIZE ? (
        <nav aria-label="Delivery pages" className="message-log-pager">
          {page > 1 ? (
            <Link href={logsHref({ ...currentFilters, page: page - 1 })}>
              Previous
            </Link>
          ) : (
            <span>Previous</span>
          )}
          <span>
            Page {page} of {totalPages}
          </span>
          {page < totalPages ? (
            <Link href={logsHref({ ...currentFilters, page: page + 1 })}>
              Next
            </Link>
          ) : (
            <span>Next</span>
          )}
        </nav>
      ) : null}
      <MessageLogTable
        order={order}
        rows={rows}
        sort={sort}
        sortLinks={sortLinks}
      />
    </section>
  );
}
