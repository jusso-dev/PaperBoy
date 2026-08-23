import { can } from "@/lib/authorization";
import { getMessageDeliveryOverview } from "@/lib/message-statuses";
import { requireOrganization } from "@/lib/session";
import { formatDateTime } from "@/lib/time";

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

export default async function Logs() {
  const { organization, session } = await requireOrganization();
  const canRead = can(organization.role, "messages.read");
  const overview = canRead
    ? await getMessageDeliveryOverview({
        actorUserId: session.user.id,
        orgId: organization.id,
      })
    : null;

  return (
    <section>
      <h1 className="page-title">Delivery</h1>
      <p className="page-sub">
        Durable queue and worker outcomes. Times use{" "}
        <code>{session.user.timezone}</code>.
      </p>

      {!overview ? (
        <p className="empty-state">Your role cannot read delivery status.</p>
      ) : (
        <>
          <dl className="delivery-counts">
            {(["queued", "sending", "sent", "failed"] as const).map(
              (status) => (
                <div
                  className={`delivery-count delivery-count-${status}`}
                  key={status}
                >
                  <dt>{status}</dt>
                  <dd>{overview.counts[status]}</dd>
                </div>
              ),
            )}
          </dl>

          {overview.messages.length === 0 ? (
            <p className="empty-state">No messages have been queued yet.</p>
          ) : (
            <div className="table-scroll">
              <table className="table delivery-table">
                <caption>
                  Most recent 50 messages. Recipient and message content stay
                  private.
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Message</th>
                    <th scope="col">State</th>
                    <th scope="col">Attempts</th>
                    <th scope="col">Queued</th>
                    <th scope="col">State time</th>
                    <th scope="col">Failure</th>
                  </tr>
                </thead>
                <tbody>
                  {overview.messages.map((message) => {
                    const stateTime = eventTime(message);

                    return (
                      <tr key={message.id}>
                        <td>
                          <code>{message.id}</code>
                          <span className="delivery-meta">
                            {message.environment} · {message.deliveryMode}
                          </span>
                        </td>
                        <td>
                          <span
                            className={`pill delivery-status-${message.status}`}
                          >
                            {message.status}
                          </span>
                        </td>
                        <td>{message.attemptCount}</td>
                        <td>
                          {formatDateTime(
                            message.createdAt,
                            session.user.timezone,
                          )}
                        </td>
                        <td>
                          {stateTime ? (
                            <>
                              <span className="delivery-meta">
                                {eventLabel(message.status)}
                              </span>
                              {formatDateTime(
                                stateTime,
                                session.user.timezone,
                              )}
                            </>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td>
                          {message.failureReason ? (
                            <>
                              {message.lastErrorCode ? (
                                <code>{message.lastErrorCode}</code>
                              ) : null}
                              <span className="delivery-failure">
                                {message.failureReason}
                              </span>
                            </>
                          ) : (
                            "—"
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </section>
  );
}
