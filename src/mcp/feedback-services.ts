import { ingestFeedbackReport } from "@/lib/feedback";
import type { PaperBoyMcpFeedbackServices } from "@/mcp/feedback-tools";

export const paperBoyMcpFeedbackServices: PaperBoyMcpFeedbackServices = {
  ingest: (principal, raw) =>
    ingestFeedbackReport({
      actorUserId: principal.actorUserId,
      orgId: principal.orgId,
      raw,
    }),
};
