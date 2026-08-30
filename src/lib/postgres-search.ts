/**
 * Builds a case-insensitive "contains" pattern for a PostgreSQL `ilike`
 * comparison, escaping the LIKE metacharacters so an operator searching for
 * `a_b` or `%` matches those characters literally instead of every row.
 *
 * Callers must pair the pattern with `escape '\\'`:
 *   sql`${column} ilike ${containsPattern(term)} escape '\\'`
 */
export function containsPattern(term: string): string {
  return `%${term.replace(/[\\%_]/g, "\\$&")}%`;
}
