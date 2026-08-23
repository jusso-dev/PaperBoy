export class OutboundProviderEventError extends Error {
  constructor(
    readonly code:
      | "INVALID_EVENT"
      | "MEMBERSHIP_REQUIRED"
      | "NO_MATCHING_MESSAGE"
      | "UNSUPPORTED_PROVIDER",
  ) {
    super(code);
    this.name = "OutboundProviderEventError";
  }
}
