export function publicSignUpEnabled(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): boolean {
  const value = environment.PAPERBOY_PUBLIC_SIGNUP_ENABLED;

  if (value === undefined || value === "" || value === "false") return false;
  if (value === "true") return true;

  throw new Error(
    "PAPERBOY_PUBLIC_SIGNUP_ENABLED must be either true or false.",
  );
}
