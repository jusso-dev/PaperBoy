import { rateLimitApiServices } from "@/lib/rate-limit-api-services";
import type { PaperBoyMcpRateLimitServices } from "@/mcp/rate-limit-tools";

export const paperBoyMcpRateLimitServices: PaperBoyMcpRateLimitServices =
  rateLimitApiServices;
