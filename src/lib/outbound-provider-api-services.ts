import type { ApiKeyPrincipal } from "@/lib/api-key-auth";
import type { OutboundProviderHttpServices } from "@/lib/outbound-provider-http";
import { testConfiguredOutboundProvider } from "@/lib/outbound-provider-runtime";
import {
  getOutboundProviderSettings,
  OutboundProviderSettingsError,
  testOutboundProviderConnection,
  updateOutboundProviderSettings,
} from "@/lib/outbound-providers";

function actorUserId(principal: ApiKeyPrincipal): string {
  if (!principal.actorUserId) {
    throw new OutboundProviderSettingsError("MEMBERSHIP_REQUIRED");
  }
  return principal.actorUserId;
}

export const outboundProviderApiServices: OutboundProviderHttpServices = {
  get: (principal) =>
    getOutboundProviderSettings({
      actorUserId: actorUserId(principal),
      orgId: principal.orgId,
    }),
  test: (principal, payload) =>
    testOutboundProviderConnection({
      actorUserId: actorUserId(principal),
      orgId: principal.orgId,
      payload,
      testConnection: testConfiguredOutboundProvider,
    }),
  update: (principal, payload) =>
    updateOutboundProviderSettings({
      actorUserId: actorUserId(principal),
      orgId: principal.orgId,
      payload,
    }),
};
