function exactEnvironmentValue(
  name: string,
  environment: Readonly<Record<string, string | undefined>>,
): string | null {
  const value = environment[name];
  if (value === undefined || value === "") return null;
  if (value !== value.trim() || /[\u0000-\u001f\u007f]/.test(value)) {
    throw new Error(`${name} is invalid.`);
  }
  return value;
}

function passkeyOrigin(value: string): URL {
  const origin = new URL(value);
  if (
    origin.origin !== value ||
    (origin.protocol !== "https:" &&
      !["localhost", "127.0.0.1"].includes(origin.hostname))
  ) {
    throw new Error(
      "PAPERBOY_PASSKEY_ORIGIN must be an HTTPS origin without a path, except for loopback development.",
    );
  }
  return origin;
}

export function configuredPasskeys(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): { origin: string; rpID: string; rpName: string } {
  const originValue =
    exactEnvironmentValue("PAPERBOY_PASSKEY_ORIGIN", environment) ??
    exactEnvironmentValue("PAPERBOY_PUBLIC_URL", environment) ??
    exactEnvironmentValue("BETTER_AUTH_URL", environment);
  if (!originValue) {
    throw new Error(
      "PAPERBOY_PASSKEY_ORIGIN, PAPERBOY_PUBLIC_URL, or BETTER_AUTH_URL is required for passkeys.",
    );
  }
  const origin = passkeyOrigin(originValue);
  const rpID =
    exactEnvironmentValue("PAPERBOY_PASSKEY_RP_ID", environment) ??
    origin.hostname;
  if (
    !/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)*[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(
      rpID,
    ) ||
    (origin.hostname !== rpID && !origin.hostname.endsWith(`.${rpID}`))
  ) {
    throw new Error(
      "PAPERBOY_PASSKEY_RP_ID must equal the passkey origin host or a registrable parent domain.",
    );
  }
  return { origin: origin.origin, rpID, rpName: "PaperBoy" };
}
