import { AuthorizationError } from "@/lib/authorization";
import {
  buildDashboardExportCsv,
  dashboardExportFilename,
} from "@/lib/dashboard-export";
import {
  dashboardRangeLabel,
  getPaperBoyDashboardExport,
  parseDashboardRange,
} from "@/lib/dashboard";
import { MessageStatusError } from "@/lib/message-status-core";
import { requireOrganization } from "@/lib/session";

function failure(message: string, status: number): Response {
  return new Response(message, {
    headers: {
      "Cache-Control": "private, no-store",
      "Content-Type": "text/plain; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
    },
    status,
  });
}

export async function GET(request: Request) {
  const { organization, session } = await requireOrganization();
  const range = parseDashboardRange(
    new URL(request.url).searchParams.get("range") ?? undefined,
  );
  const now = new Date();
  const timeZone = session.user.timezone;

  try {
    const report = await getPaperBoyDashboardExport({
      actorUserId: session.user.id,
      now,
      orgId: organization.id,
      range,
      timeZone,
    });
    const csv = buildDashboardExportCsv({
      generatedAt: now.toISOString(),
      messages: report.messages,
      messagesTruncated: report.messagesTruncated,
      metrics: report.dashboard.metrics,
      range,
      rangeLabel: dashboardRangeLabel({ now, range, timeZone }),
      series: report.dashboard.series,
      timeZone,
    });

    return new Response(csv, {
      headers: {
        "Cache-Control": "private, no-store",
        "Content-Disposition": `attachment; filename="${dashboardExportFilename({ now, range })}"`,
        "Content-Type": "text/csv; charset=utf-8",
        "X-Content-Type-Options": "nosniff",
      },
      status: 200,
    });
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return failure("You do not have permission to export overview metrics.", 403);
    }
    if (error instanceof MessageStatusError) {
      return failure("Organization membership required.", 403);
    }
    console.error("PaperBoy overview export failed.");
    return failure("Overview export failed.", 500);
  }
}
