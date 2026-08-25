import {
  dashboardRangeParam,
  type DashboardRange,
} from "@/lib/dashboard-range";

export const DASHBOARD_EXPORT_MESSAGE_LIMIT = 5_000;

export type DashboardExportMetric = {
  delta: number | null;
  id: string;
  label: string;
  value: number | null;
};

export type DashboardExportSeriesPoint = {
  bounced: number;
  bucket: string;
  clicked: number;
  complained: number;
  delivered: number;
  opened: number;
};

export type DashboardExportMessage = {
  createdAt: string;
  id: string;
  recipient: string;
  status: string;
  subject: string;
};

export function csvCell(value: string | number | boolean | null): string {
  const text = value === null ? "" : String(value);
  if (/[",\n\r]/.test(text)) return `"${text.replaceAll('"', '""')}"`;
  return text;
}

export function dashboardExportFilename(input: {
  now: Date;
  range: DashboardRange;
}): string {
  const day = input.now.toISOString().slice(0, 10).replaceAll("-", "");
  const rangePart =
    input.range === "all" ? "all" : `${dashboardRangeParam(input.range)}d`;
  return `paperboy-overview-${rangePart}-${day}.csv`;
}

export function buildDashboardExportCsv(input: {
  generatedAt: string;
  messages: DashboardExportMessage[];
  messagesTruncated: boolean;
  metrics: DashboardExportMetric[];
  range: DashboardRange;
  rangeLabel: string;
  series: DashboardExportSeriesPoint[];
  timeZone: string;
}): string {
  const lines = [
    "# PaperBoy overview export",
    `# range,${csvCell(dashboardRangeParam(input.range))}`,
    `# range_label,${csvCell(input.rangeLabel)}`,
    `# timezone,${csvCell(input.timeZone)}`,
    `# generated_at,${csvCell(input.generatedAt)}`,
    `# messages_exported,${input.messages.length}`,
    `# messages_truncated,${input.messagesTruncated ? "true" : "false"}`,
    "# messages_scope,created_in_selected_range",
    "",
    ["metric", "label", "value", "previous_period_delta_percent"]
      .map(csvCell)
      .join(","),
    ...input.metrics.map((metric) =>
      [metric.id, metric.label, metric.value, metric.delta].map(csvCell).join(","),
    ),
    "",
    [
      "bucket",
      "delivered",
      "opened",
      "clicked",
      "bounced",
      "complained",
    ]
      .map(csvCell)
      .join(","),
    ...input.series.map((point) =>
      [
        point.bucket,
        point.delivered,
        point.opened,
        point.clicked,
        point.bounced,
        point.complained,
      ]
        .map(csvCell)
        .join(","),
    ),
    "",
    ["id", "created_at", "status", "recipient", "subject"].map(csvCell).join(","),
    ...input.messages.map((message) =>
      [
        message.id,
        message.createdAt,
        message.status,
        message.recipient,
        message.subject,
      ]
        .map(csvCell)
        .join(","),
    ),
  ];

  return `\uFEFF${lines.join("\n")}\n`;
}
