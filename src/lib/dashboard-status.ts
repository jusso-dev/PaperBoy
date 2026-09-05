export type DashboardEmailStatus =
  | "bounced"
  | "cancelled"
  | "complained"
  | "deferred"
  | "delivered"
  | "failed"
  | "opened"
  | "queued"
  | "sending"
  | "sent";

const STATUS_PRIORITY: Record<DashboardEmailStatus, number> = {
  bounced: 11,
  cancelled: 3,
  complained: 12,
  deferred: 5,
  delivered: 6,
  failed: 10,
  opened: 9,
  queued: 1,
  sending: 2,
  sent: 4,
};

function isDashboardEmailStatus(value: string): value is DashboardEmailStatus {
  return Object.hasOwn(STATUS_PRIORITY, value);
}

export function resolveDashboardEmailStatus(
  messageStatus: DashboardEmailStatus,
  eventTypes: readonly string[],
): DashboardEmailStatus {
  let status = messageStatus;

  for (const type of eventTypes) {
    if (
      isDashboardEmailStatus(type) &&
      STATUS_PRIORITY[type] > STATUS_PRIORITY[status]
    ) {
      status = type;
    }
  }

  return status;
}
