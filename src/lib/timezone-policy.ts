import {
  canonicalTimeZone,
  DEFAULT_TIME_ZONE,
  normalizeTimeZone,
} from "@/lib/time";

function configuredTimeZone(
  name: "PAPERBOY_DEFAULT_TIME_ZONE" | "PAPERBOY_FIXED_TIME_ZONE",
  environment: Readonly<Record<string, string | undefined>>,
): string | null {
  const value = environment[name];
  if (value === undefined || value === "") return null;

  const canonical = canonicalTimeZone(value);
  if (!canonical || canonical !== value) {
    throw new Error(`${name} must be a canonical IANA timezone.`);
  }
  return canonical;
}

export function defaultApplicationTimeZone(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): string {
  return (
    configuredTimeZone("PAPERBOY_DEFAULT_TIME_ZONE", environment) ??
    DEFAULT_TIME_ZONE
  );
}

export function fixedApplicationTimeZone(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): string | null {
  return configuredTimeZone("PAPERBOY_FIXED_TIME_ZONE", environment);
}

export function effectiveUserTimeZone(
  storedTimeZone: unknown,
  environment: Readonly<Record<string, string | undefined>> = process.env,
): string {
  return normalizeTimeZone(
    storedTimeZone || defaultApplicationTimeZone(environment),
  );
}
