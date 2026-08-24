export function isPostgresErrorCode(
  error: unknown,
  expectedCode: string,
  seen = new Set<object>(),
): boolean {
  if (!error || typeof error !== "object" || seen.has(error)) {
    return false;
  }
  seen.add(error);

  if (
    ("code" in error && error.code === expectedCode) ||
    ("errno" in error && error.errno === expectedCode)
  ) {
    return true;
  }

  return (
    "cause" in error &&
    isPostgresErrorCode(error.cause, expectedCode, seen)
  );
}
