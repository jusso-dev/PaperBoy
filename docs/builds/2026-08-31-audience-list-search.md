# Audience List Search Buildout

Created: 2026-08-31
Author: josh@luongo.com.au
Agent: Claude Code
Status: VERIFIED
Approved: Yes
Rounds: 3
Worktree: No
Type: Build

## Summary

**Goal:** `/app/audiences` gets server-side search on both email lists — the audience picker sidebar and the contacts table — matching the GET-form pattern already used by `/app/logs` and `/app/suppressions`.

**Oracle:** In a browser on the running app, typing a substring into the contacts search narrows the contacts table to exactly the rows whose email or name contains it, and typing into the audience search narrows the sidebar — with the expected row set computed independently from the database, not from the page.

**Misfire:** The search works, but filtering the `contacts` array silently rescopes the derived "N unsubscribed" count and the "Delete all unsubscribed" bulk-delete control. `deleteUnsubscribedContacts` (src/lib/audiences.ts) deletes **every** unsubscribed row in the audience regardless of any filter, while `unsubscribedCount` in page.tsx is computed from the displayed rows — so an operator who searches "gmail", sees "2 unsubscribed" and confirms would destroy all 47. A second, quieter form: filtering the sidebar drops the selected audience from `records`, and the `records[0]` fallback silently switches which audience's contacts are on screen. Criterion 5 catches the first; Criterion 4 catches the second.

**Constraints:** Dashboard UI only — `openapi.yaml`, `sdks/`, `sdk-generator/`, and `src/mcp/` are untouched. No new dependencies; server-side GET forms only, no client-side filtering. Existing audience/contact behaviour, permissions, and CSV import stay identical.

**Assumed:** Nothing — both forks were settled by the user at Step 1.5 (both lists; dashboard UI only). `PILOT_BRANCH_ISOLATION_ENABLED=false`, so the run works on the current branch.

**Reference:** The existing in-repo search surfaces — re-obtain with `sed -n '155,195p' src/app/app/suppressions/page.tsx` and `sed -n '347,420p' src/app/app/logs/page.tsx`, with their query layers at `sed -n '70,120p' src/lib/suppressions.ts` and `sed -n '135,170p' src/lib/message-statuses.ts`.

## Acceptance Criteria

- [x] Criterion 1 **[ORACLE]**: In a browser on the running app, searching the contacts box for a term returns exactly the contact rows whose email or name contains that term case-insensitively — the displayed row count and addresses matching a set computed independently by SQL against the same database.
- [x] Criterion 2: Clearing the contacts search box restores every contact in the audience, verified in the browser by comparing the displayed row count and addresses to the unfiltered SQL query.
- [x] Criterion 3: Searching the audience picker narrows the sidebar to exactly the audiences whose name contains the term case-insensitively, verified in the browser by reading the sidebar list before and after.
- [x] Criterion 4 **[MISFIRE]**: When a sidebar search excludes the currently selected audience, the contacts table keeps showing that audience's rows rather than falling through to the first result of the filtered list — verified in the browser by reading the heading and contact rows before and after applying a search that excludes the selection.
- [x] Criterion 5 **[MISFIRE]** *(rewritten by the user after round 1, extended again after round 2 — see Round Log)*: The unsubscribed count describes the whole audience, never the search result; the "Delete all unsubscribed" control is disabled while a contact search is active; and the server action itself refuses a submission carrying an active search term — proven by a database-backed test asserting the count under a filter that hides some unsubscribed contacts, and by a browser check that defeats the disabled control, submits anyway, and confirms the server rejects it with nothing deleted.
- [x] Criterion 6: A search term containing `%`, `_`, or `\` matches those characters literally and returns no unintended rows — proven by a database-backed test seeding a contact whose address contains a literal `_` alongside one that a wildcard interpretation would wrongly match.
- [x] Criterion 7: Both search forms are `method="get"` with a labelled input and no client-side filtering state, matching the house pattern in `/app/suppressions` — read from the rendered HTML of the running page.
- [x] Criterion 8: The active search term is preserved on page reload and a Clear affordance appears only when a search term is active, for both controls — read from the rendered HTML of the running page before and after a reload.

### Round 1 verdicts

| # | Verdict | Evidence pointed at |
|---|---|---|
| 1 **[ORACLE]** | pass | Typed `ada` into `#contact-query` and submitted → table rows exactly `["ada@example.net","ada@gmail.test"]` (2 of 10). Independent SQL `strpos(lower(email\|name), 'ada')` returned the same two addresses. `gmail` → exactly the two `@gmail.test` rows; `Hopper` and `HOPPER` → `grace@example.net`. |
| 2 | pass | From the `ada` view (2 rows), clicked the Clear link (`/app/audiences?audience=…`) → 10 rows, exactly the full unfiltered address set, `#contact-query` empty, Clear link gone. |
| 3 | pass | Sidebar `weekly` and `WEEKLY` → exactly `["Weekly archive","Weekly readers"]`, matching independent SQL; `digest` → `["Product digest"]`; `%` → "No audiences match that search." |
| 4 **[MISFIRE]** | pass | With `audience=a00f0edd…` (Weekly readers) selected, submitted sidebar search `product`. Sidebar narrowed to `["Product digest"]` while `.audience-heading h2` still read **Weekly readers** and the table still held all 10 of its contacts. The pre-change `records[0]` fallback would have switched to Product digest with 0 rows. |
| 5 **[MISFIRE]** | pass (re-judged after the user's rewrite — see Round 2) | Search `gmail` shows 2 rows of which exactly 1 is unsubscribed, yet heading reads "2 of 10 shown · 3 unsubscribed in this audience" and the button reads "Delete all 3 unsubscribed" — byte-identical to the unfiltered baseline. Pre-change the derived count would have read 1 while the action deleted 3. Backed by the DB test asserting `contactCount 6 / activeContactCount 4` while the filtered query returns 1 row, and `deleteUnsubscribedContacts` removing 2. |
| 6 | pass | `a_b` → only `a_b@example.net`, not the wildcard-bait `axb@example.net`; `%` and `\` → "No contacts match that search." (an unescaped `%` would have matched all 10). Backed by the same assertions in the DB test. |
| 7 | pass | `formMethods` read `["get","get"]`; inputs labelled "SEARCH AUDIENCES" / "SEARCH CONTACTS"; zero `<script>` elements inside either form; the sidebar form carries a hidden `audience` input so the selection survives submission. |
| 8 | pass | Reloading `?audience=…&audienceQuery=weekly&contactQuery=example` → `#audience-query` = "weekly", `#contact-query` = "example", both Clear links present. On the unfiltered baseline `clearLinks` was `[]`. |

## Out of Scope

- `GET /v1/audiences/{audienceId}/contacts` query parameter, `openapi.yaml`, regenerated SDKs, and the MCP tool surface.
- Pagination for audiences or contacts.
- Search on `/app/logs` and `/app/suppressions`, which already have it.

## Progress Tracking

- [x] Task 1: Parse and validate the search terms in `audience-core.ts`
- [x] Task 2: Thread a server-side filter through `listAudiences` and `listContacts`
- [x] Task 3: Wire both search forms into the audiences page, keeping the destructive control honest
- [x] Task 4: Style the two controls to match the existing filter forms
- [x] Task 5: Behavioural tests for parsing, escaping, and count scoping
- [x] Task 6: Stand up Postgres and the dev server, seed data, and browser-verify the oracle

## Implementation Tasks

### Task 1: Parse and validate the search terms in `audience-core.ts`

**Objective:** Add the pure parsing layer the two lists share — trim, drop empties, cap length — mirroring `parseSuppressionListInput` in `src/lib/suppression-core.ts`. This is the piece that is unit-testable without a database and that keeps a hostile or oversized term from reaching SQL.

### Task 2: Thread a server-side filter through `listAudiences` and `listContacts`

**Objective:** Give both list functions in `src/lib/audiences.ts` an optional search argument that filters in the database with `ilike` over the right columns — audience name for the picker, email and name for contacts. The LIKE-metacharacter escaper is currently duplicated in `suppressions.ts:74` and `message-statuses.ts:139`; this is the third use, so extract it once rather than copying it again. Existing callers must keep working unchanged.

### Task 3: Wire both search forms into the audiences page, keeping the destructive control honest

**Objective:** Add the two GET forms to `src/app/app/audiences/page.tsx`, reading new search params and preserving the selected `audience` across submissions. Critically, decouple the unsubscribed count and the "Delete all unsubscribed" control from the filtered `contacts` array so the destructive action can never be mislabelled by a search, and keep the selected audience selected even when the sidebar search hides it.

### Task 4: Style the two controls to match the existing filter forms

**Objective:** Add the CSS for the two new controls in `src/app/globals.css`, following `.suppression-filter-form` and `.message-log-filters`, so the page reads as part of the same console rather than as a bolted-on box.

### Task 5: Behavioural tests for parsing, escaping, and count scoping

**Objective:** Cover the new behaviour where it can actually fail: term parsing in `tests/audience-core.test.mjs`, and filtered queries, literal metacharacter handling, and whole-audience count scoping in `tests/audience-postgres.test.mjs`. No string-presence assertions against source files.

### Task 6: Stand up Postgres and the dev server, seed data, and browser-verify the oracle

**Objective:** Bring up a real database via OrbStack, apply migrations, create an organisation with an audience holding a known mix of contacts, run the dev server, and drive the page in a browser to settle Criteria 1, 2, 3, and 5 against a running artifact rather than against source.

## Round Log

- Round 1: built all six tasks as drafted — no task added, split, or dropped. Tasks 1 and 2 were built test-first, which meant Task 5's coverage already existed by the time it came up; it was ticked on the tests written during those tasks rather than on new ones. Judge: 8/8 pass. Both misfires named at Step 1.5 were reproduced against the pre-change behaviour and shown closed: the derived unsubscribed count (Criterion 5) and the `records[0]` selection fallback (Criterion 4).
- Round 1 note — live target: Tier 2. No dev server or database was running at the start, and OrbStack's daemon was down. Started OrbStack, ran `postgres:17-alpine` on 127.0.0.1:5433, brought up the repo's own `compose.dev.yml` (redis + mailpit), wrote a gitignored `.env`, applied `bun run db:migrate`, and started `bun run dev` on :3000. Re-obtain with `docker start paperboy-dev-pg && docker compose -f compose.dev.yml up -d && bun run dev`.
- Round 1 note — driver: Chrome DevTools MCP, settled on first attempt. The project names no browser driver (no `playwright.config.*`, no browser dependency in `package.json`), so the generic ladder applied and tier 2 was the highest available.
- Round 2 (post-hand-back, user-directed): the user chose the stricter of the two options offered in the round-1 report and asked to disable the bulk delete during a search. **Criterion 5 rewritten at the user's instruction** (5.4, row 1 — the user rewrote a criterion). Before: "The unsubscribed count and the 'Delete all unsubscribed' control describe the whole audience, never the search result — proven by a database-backed test … and by a browser check showing the number and button label unchanged when a search is applied." After: as now written above, adding that the control is disabled outright while a contact search is active. The bar rose rather than fell: the previous wording is still fully satisfied, and the new clause is an additional requirement. Re-judged from the artifact: pass.
- Round 2 evidence: with `contactQuery=gmail`, `button.disabled` and `input[name=confirm].disabled` both `true`, `aria-describedby="audience-bulk-delete-note"` resolves to the rendered note, which gains "Unavailable while a contact search is active; clear the search to delete." Clicking the checkbox and the button left the URL unchanged, the checkbox unchecked, and the audience still holding its 3 unsubscribed rows in PostgreSQL. With no search, the same control is enabled and a real end-to-end delete on a throwaway audience removed exactly its 2 unsubscribed rows and retained `keep@example.net`, proving the legitimate path is untouched. The bulk-delete note also moved above the search form so it again sits with the control it describes. No new CSS was needed — `.btn:disabled` already existed at `globals.css:278`.
- Round 3 (post-hand-back, user-directed): after round 2 the report disclosed that the disable was a UI-only guard a hand-crafted POST could bypass; the user asked for it to be enforced in the action too. **Criterion 5 extended at the user's instruction** (5.4, row 1). The bar rose again: rounds 1 and 2 clauses both still hold, with the server-side refusal added. Re-judged from the artifact: pass.
- Round 3 implementation: `src/app/app/audiences/actions.ts` now reads `contactQuery` off the submitted `FormData`, runs it through the already-tested `parseAudienceSearch`, and redirects with an error when a term is present — placed beside the existing `confirm !== "yes"` guard and, importantly, *before* `context()` and the delete call. The bulk-delete form in `page.tsx` emits the term as a hidden input while a search is active. The rejection redirect carries `contactQuery` back so the "clear the search" message arrives with the search still on screen and its Clear button visible.
- Round 3 evidence: in the browser with `contactQuery=gmail`, set `button.disabled = false` and `checkbox.disabled = false` and submitted — exactly the bypass the round-2 report named. Server redirected to `?contactQuery=gmail&error=Clear+the+contact+search+…`, the page rendered that message in a `role="alert"` region with the search still applied (2 rows) and the control disabled again, and PostgreSQL still held all 3 unsubscribed rows. With no search the hidden field is absent, the control is enabled, and a real delete on a throwaway audience removed exactly its 2 unsubscribed rows and kept `stay@example.net`. Both throwaway audiences were deleted afterwards; the main fixture is unchanged at 10 contacts / 3 unsubscribed.
- Round 3 note — residual: a client that simply omits the `contactQuery` field still passes the guard. That is not a privilege boundary — the same authenticated `audiences.manage` actor can legitimately clear the search and delete — so closing it would need a signed server-issued token, which is disproportionate to a self-inflicted footgun. What the guard does close is every path that submits the form as rendered, including a forced-enable of the disabled control. Recorded rather than silently designed around.
- Round 1 note — toolchain: the installed Bun is 1.3.14 while the repo pins `bun@1.4.0`. On 1.3.14 `tests/console-send-postgres.test.mjs` aborts with `NotImplementedError: test() inside another test()`, a runner feature gap in a file this run never touched. Installed the pinned 1.4.0 into the session scratchpad and ran the suite with it; the repo's own toolchain is unchanged.

## Verification Record

- Profile: Full (code with a user-facing UI)
- Live target: Tier 2 — started `postgres:17-alpine` on 127.0.0.1:5433 plus the repo's `compose.dev.yml` (redis, mailpit), applied `db:migrate`, ran `bun run dev` on :3000. Driver: Chrome DevTools MCP, settled first attempt.
- Identity re-asserted after the dependency reinstall and dev-server restart: `contactQuery=gmail` → `["ada@gmail.test","gone@gmail.test"]`, `a_b` → `["a_b@example.net"]`, `%` → no matches, unfiltered → all 10 rows. Matches the pre-restart run exactly.
- Commands (all on the repo-pinned Bun 1.4.0, CI-equivalent env, `.env` moved aside as CI has none):
  - `bun test tests/*.test.mjs` — pass (310 pass, 0 fail, 86 files)
  - `bun run typecheck` — pass (exit 0)
  - `bun run lint` — pass (exit 0)
  - `bun run build` — pass (exit 0)
  - `bun install --frozen-lockfile` — pass (lockfile restored to HEAD, `git status bun.lock` clean)
- Browser E2E: sign-up → `/app/audiences`; typed into `#contact-query` and `#audience-query` and submitted both forms; clicked both Clear links; reloaded a URL carrying both terms. Expected result sets computed independently via SQL `strpos(lower(...))` rather than `ilike`, so the expectation does not share the implementation's logic. Console errors/warnings: none.
- Reviewers: `changes-review` — 0 must_fix, 1 should_fix (out-of-lineage, see `## Not Verified`), 8/8 truths verified, compliance high, quality high, goal achieved. `build-review` (pre-loop) — 0 must_fix, 3 criterion-splitting findings, all applied.
- Docs: `docs/audiences.md` updated with the console search behaviour and the whole-audience guarantee on the bulk delete.
- Regression: suite, typecheck, lint, and build re-run green after the lockfile restore, after the round-2 bulk-delete change, and again after the round-3 action guard (`310 pass / 0 fail`, typecheck 0, lint 0, build exit 0, `bun.lock` clean).
- Round 2 re-verification (per 7.4, a post-hand-back change re-enters Step 6): typecheck, lint, suite, and build re-run green; the disabled and enabled states of the bulk delete were both driven in the browser, including a real destructive submit on a throwaway audience that was deleted afterwards; `docs/audiences.md` updated to match the new behaviour. No new reviewer pass was launched — the change is 14 lines inside one already-reviewed file and adds no new query, dependency, or data path.
- Shortcut debt: `grep -nE '(#|//) ?SHORTCUT:'` over the changed files — no markers added.

## Not Verified

- **LIKE-escaper duplication not consolidated** (`changes-review` should_fix). `src/lib/suppressions.ts:74` and `src/lib/message-statuses.ts:139` still define their own byte-identical `searchPattern`, so three copies of the escaping logic now exist. Both files are outside `## Changed Files`, so under this workflow's lane rule the finding is mention-only: consolidating them does not trace to "add a search to the email lists" and would change two unrelated search surfaces. Tracked as a follow-up, deliberately not fixed here.
- **`docs/screenshots/audiences-desktop.png` is now stale.** It shows the "Audience list" card, which has gained a search box. Regenerating it faithfully needs the documented demo workspace ("Paper Co", its exact audience and contact fixtures), which this run does not have. The image was already stale before this change — it shows a "Domains" nav item the current console does not render.
- **Search terms are dropped by the row action redirects.** `destination()` in `src/app/app/audiences/actions.ts` rebuilds the query string from status values plus `audience` only, so saving or removing a contact returns to the unfiltered list. Pre-existing redirect behaviour, untouched here; threading the terms through would mean adding hidden inputs to every row form.
- **Suite runs required a non-default toolchain and env.** The installed Bun is 1.3.14 against the repo's pinned 1.4.0; on 1.3.14 `tests/console-send-postgres.test.mjs` aborts on a runner feature gap. Verified on a scratchpad-installed 1.4.0. The local `.env` must also be moved aside, because Bun auto-loads it and its signing keys break `tests/open-tracking-core.test.mjs`, a misconfiguration guard that asserts the *absence* of a configured key. Neither is a product defect; both were reproduced and attributed.
- **The round-3 action guard is not covered by the automated suite.** `src/app/app/audiences/actions.ts` transitively imports `src/lib/session.ts`, which imports `server-only` and therefore cannot be loaded by `bun test` outside Next's bundler (`Cannot find package 'server-only'`). Covering it would mean adding a module stub and preload config the repo does not currently have. I deliberately did **not** extract a thin `bulkDeleteBlockedBySearch()` wrapper to get a green unit test: its body is one call to the already-tested `parseAudienceSearch`, so such a test would pass while missing the regressions that actually matter — the hidden input being dropped from the form, or the field being renamed on one side only. Those are caught by the adversarial browser check recorded in Round 3, which is manual. A regression in this guard would therefore not fail `bun test`.
- **No CI run.** Verification is local only; nothing was pushed and no pipeline was exercised.

## Changed Files

- docs/audiences.md
- src/app/app/audiences/page.tsx
- src/app/globals.css
- src/lib/audience-core.ts
- src/lib/audiences.ts
- src/lib/postgres-search.ts
- tests/audience-core.test.mjs
- tests/audience-postgres.test.mjs
