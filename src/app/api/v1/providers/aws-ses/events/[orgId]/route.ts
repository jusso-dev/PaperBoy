import { handleAwsSesSnsRequest } from "@/lib/outbound-provider-sns-http";

export function POST(
  request: Request,
  context: { params: Promise<{ orgId: string }> },
) {
  return context.params.then(({ orgId }) =>
    handleAwsSesSnsRequest(request, orgId),
  );
}
