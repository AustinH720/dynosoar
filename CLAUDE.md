# DynoSOAR Command Center — Project Context

This file gives an AI coding assistant everything needed to pick up development
on this project without prior context. It lives at the project root and travels
with the repo via git, so any machine that clones/pulls gets it automatically.

## What this is

A personal productivity + gamification web app ("DynoSOAR Command Center").
Capture tasks/events/notes/routines in one box, everything gets auto-classified,
and progress feeds a dinosaur companion ("Mossback") that levels up and evolves
through visual stages. Also has a Shop with equippable cosmetics reflected on
the Home avatar, a monthly Events calendar view, rich-text Notes, and a Focus
Timer (Pomodoro-style, credits variable XP based on session length).

## Tech stack

- **Client:** React + TypeScript (Vite build), pages under `client/src/pages/`
- **Server:** Node/Express-style TypeScript, bundled to `dist/index.cjs`
- **Node version:** Mac dev machine pins ~v20.20.1 (native `fetch` available,
  no polyfill needed). The Windows PC (see "Multiple dev machines" below) has
  only been run against Node 24.x so far — the dev server works fine there,
  but the two haven't been verified to behave identically beyond that. If
  something behaves differently across machines, version skew is a place to
  check.
- **Package manager:** npm
- **Build:** `npm run build` — builds client (Vite) + bundles server to a single
  `dist/index.cjs` (~840kb)
- **Typecheck:** `npx tsc --noEmit` — baseline has 4 pre-existing, unrelated
  errors in `server/lib/dedupe.ts` and `server/lib/gamification.ts`
  (regex-flag / Set-iteration issues). These are known and not regressions;
  don't spend time "fixing" them unless specifically asked.
- **Windows-only note:** `npm run dev` must NOT use a bash-style
  `NODE_ENV=development` prefix — cmd.exe can't parse it (this has already
  been fixed in `package.json`; NODE_ENV is unset in dev and that's fine,
  it's only checked in one place in `server/index.ts` where unset behaves
  identically to `"development"`). Also, `server/index.ts`'s `listen()` call
  must NOT include `reusePort: true` — that's a Linux-only socket option and
  Windows rejects it with `ENOTSUP`. Both fixes are already in `main`.
- **`better-sqlite3` is dead code.** It's a dependency of an unused
  boilerplate `users`/auth table (`server/storage.ts`, `shared/schema.ts`)
  that nothing in `routes.ts` ever imports. It requires a native build
  toolchain (Python + a C++ compiler) to install cleanly, which may not be
  present on a fresh machine. If `npm install` fails on it, use
  `npm install --ignore-scripts` — safe, since the app never touches it.

## Multiple dev machines

The user develops from two machines depending on location:
- **MacBook** ("out and about"): `~/Documents/Projects/dynosoar`
- **Windows PC** ("at home"): `F:\Projects\DynoSOAR`

GitHub (`main`) is the single source of truth between them — see the
delete-and-reclone workflow below. This file, being committed to the repo,
is what makes switching machines "seamless" for an AI assistant: whichever
machine you're cloning/pulling on, this doc comes with it, so context isn't
lost. What does NOT travel with git and must be set up independently on each
machine: the `.env` file (`GOOGLE_SERVICE_ACCOUNT_KEY`, `TODOIST_API_TOKEN`)
and any local-only IDE/tool config (e.g. this machine's `.claude/` dev-server
launcher, which is Windows-specific and intentionally not committed).

## Repo, deploy, and hosting

- **GitHub:** https://github.com/AustinH720/dynosoar.git (username `AustinH720`)
- **Hosting:** Vercel, project `dynosoar` (NOT `command-center-app`), team **AWSTN**
  - orgId: `team_FgmZC5YveoRSSAp3vSOUp74g`
  - project ID: `prj_aa5bwLgLU7YLk6C0KQ4Nx8YXa0Mb`
  - Imported under the user's personal Vercel login (ahuang.720@gmail.com)
- **Live URL:** https://dynosoar.vercel.app/#/
- **Deploy trigger:** any push to `main` auto-redeploys on Vercel (no manual
  deploy step needed)

### User's standing workflow (confirmed preference — follow this, don't propose
merge-conflict resolution instead)

When applying a new batch of changes:
1. Delete the local project folder entirely.
2. Fresh clone from GitHub.
3. Copy in the new/changed files, overwriting matching paths.
4. `npm install` → `git add -A` → `git commit -m "..."` → `git push`.

No merge conflicts to resolve — this is intentional, not a fallback. (A plain
`git pull` would also work for a solo dev with linear history, but the user
prefers the heavier reset-to-known-state version, and that preference stands.)

If Claude Code has direct local repo access (rather than working from a
dropped zip/handoff package), diffing and applying changes directly against
the existing checkout is also fine — just commit and push when done so the
other machine can pick it up via the same delete-and-reclone flow.

## Architecture — read this before making any storage decision

**All persistent state lives in a Google Sheet, accessed only through backend
API endpoints.** The client never persists anything itself (no localStorage/
sessionStorage/IndexedDB) — every read/write goes through the server, which
talks to the Sheet via a service-account-authenticated Google Sheets API client.

Why this matters even outside where the rule originated: the app is used from
multiple machines (a MacBook and a Windows PC) and needs to stay in sync, so
routing all state through one shared backing store (the Sheet) is the right
architecture regardless of tooling. Preserve this pattern for any new feature.

- **Auth in production:** `GOOGLE_SERVICE_ACCOUNT_KEY` env var (Vercel), used
  via `googleapis` service-account auth. See `server/lib/google-auth.ts` /
  `server/lib/sheets.ts`. Same var name for local dev, via `.env`.
- **Spreadsheet ID:** `18VEXw4UYNqPza7jGoUzgRDGBxHtxlHtZqf-YjpwLErY`
- **Keeping the service account key safe:** if you ever lose access to the
  key (e.g. it was stored as a Vercel "sensitive" env var and can't be
  viewed again), you don't need to redo the whole service-account setup —
  the account is already shared on the Sheet/Calendar, so just mint a new
  JSON key for the *same* service account (Cloud Console → Service Accounts
  → that account → Keys → Add Key). The real fix going forward: the moment a
  new key is downloaded, save a durable copy somewhere outside git (password
  manager, or a private local folder) before pasting it anywhere else — that
  copy is then the source of truth, and both `.env` and Vercel's env var are
  just disposable copies of it.

### Sheet tabs and columns

| Tab | sheetId | Columns |
|---|---|---|
| `📥 Inbox (Capture Here)` | 933608995 | raw capture entries |
| `🦖 Player` | 1032015355 | XP/level state |
| `✨ XP Ledger` | 526104886 | XP event log |
| `✅ Tasks` | 867128066 | task, category, dueDate, priority, status, source, dateAdded, project, todoistId |
| `📅 Events` | 789610167 | Event Title, Date, Start Time, End Time, Location, Calendar Event Link, Source, Date Added, Event ID |
| `🔁 Daily Routine` | 1954310944 | Time Block, Activity, Days, Type, Auto-add to Calendar?, Notes, Last Completed |
| `📝 Notes & Journal` | 1681059438 | notes/journal entries |
| `⚙️ Automation Log` | 780391650 | automation/system log |
| `How To Use` | 1621244951 | user-facing help text |
| `🛍️ Shop` | 35901387 | shop items |
| `⏱️ Focus Log` | *(see `TABS.FOCUS_LOG` in `server/lib/sheets.ts`)* | timestamp, durationMinutes, completed, taskRow, taskText, xpAwarded |

## Integrations

### Google Calendar
Same service-account auth as Sheets. Routine items flagged "auto-add to
calendar" and Event-type captures create real Calendar events.

### Todoist (two-way sync)
- **Auth:** `TODOIST_API_TOKEN` env var (user's own Todoist account token —
  set in Vercel for production, `.env` for local dev, same pattern as
  `GOOGLE_SERVICE_ACCOUNT_KEY`). Without it, `server/lib/todoist.ts` runs in
  a deterministic mock mode so capture/classify/sync logic still works
  end-to-end locally, just without real Todoist parsing.
- **Quick Add endpoint:** `POST https://api.todoist.com/api/v1/tasks/quick`
  with body `{ text, meta: true }` — a direct REST call, no SDK
  (`server/lib/todoist.ts`).
- **Current behavior:** capture-box text is sent to Todoist Quick Add *first*.
  Todoist's own parse of date/time/recurrence decides the bucket:
  - Todoist detects recurrence → **Recurring**
  - Todoist detects a specific time → **Event**
  - Todoist detects a date only → **Task**
  - Todoist detects no date → local heuristic (`server/lib/classify.ts`,
    `ACTION_VERBS`/`URGENT_WORDS` regex) decides Task vs. **Note** (Todoist has
    no "note" concept, so this one branch stays local)
  - See `classifyFromTodoist()` in `server/lib/classify.ts` and the capture
    route in `server/routes.ts` for the exact wiring.
  - If the Quick Add call itself fails/times out (not "found nothing," an
    actual error), `classifyTodoistFailure()` saves a plain no-date Task
    flagged for manual fix rather than blocking capture.
- Practical effect: Quick Add syntax (`#Project`, `@label`, `p1`–`p4`, natural
  language dates) now does real work in capture text.
- **Manual "Sync Todoist" button** (Tasks page) does a two-way reconciliation:
  pulls completion/status changes from Todoist for linked tasks, pushes any
  locally-created (unlinked) tasks to Todoist. See `server/lib/todoist-sync.ts`.
- **Security note:** don't paste a real `TODOIST_API_TOKEN` (or any secret)
  in plaintext into a chat session if it can be avoided — write it directly
  into the local `.env` file instead. If it does end up in chat history,
  it's low-stakes for a personal-use token, but regenerating it in Todoist's
  settings afterward is cheap insurance.

## Focus Timer + XP

- `client/src/components/FocusTimer.tsx` — Pomodoro-style presets (25/5,
  50/10) plus custom duration. Not yet mounted on a page — it's a ready
  component, but where it should live in the UI hasn't been decided.
- XP math is pure and shared between client/server via `shared/focusXp.ts`
  (imported through the `@shared/*` tsconfig/vite alias — same pattern
  `shared/schema.ts` already used).
- Crediting path: `server/lib/focus.ts` computes XP via `computeFocusXp()`,
  logs the session to the `⏱️ Focus Log` Sheet tab, then credits it to the
  player via `awardCustomXp()` in `server/lib/gamification.ts` — a
  variable-amount XP path (unlike `awardXp()`, which looks up a fixed amount
  per `source` from `XP_RULES`). No coins/skill-XP/hunger side effects for
  focus sessions currently; keep it that way unless there's a specific
  product reason to extend it.

## Companion animation

`client/src/components/DinoCompanion.tsx` already had its own breathing
(Tailwind's `animate-dino-breathe`) and blinking (a second PNG swapped in per
stage on a timer, via `STAGE_BLINK_IMAGES`) before `AnimatedCompanion.tsx`
was introduced. Don't let a future "polish the companion" pass re-add a
second breathe/blink implementation on top of these — `AnimatedCompanion`'s
job is deliberately narrow: it only adds a subtle sway (rotation) via a CSS
wrapper, passing the existing image/classes/testid straight through. Its
`blinkOverlay` prop is unused by design (dead code left as an escape hatch)
since the real per-stage blink art is already better than a generic overlay.

## Known gotchas

- `npx tsc --noEmit` baseline = 4 pre-existing errors in `dedupe.ts` /
  `gamification.ts`. Confirm this count stays the same after changes; don't
  treat it as a new regression to fix unless asked.
- macOS Terminal: password/token prompts show no characters while typing —
  this is normal masked input, not a freeze.
- macOS Terminal cannot delete files inside `~/Documents` by default
  (`rm -rf` → "Permission denied"). Use Finder's Trash, or grant Terminal Full
  Disk Access in System Settings.
- `git merge --abort` can fail with "Entry '<file>' not uptodate" — resolve via
  `git checkout -- <file>` then retry the abort. (Shouldn't come up given the
  delete-and-reclone workflow above, but noted in case.)
- GitHub push auth: username `AustinH720`, password = a Personal Access Token
  (classic, `repo` scope) — created via GitHub Settings → Developer settings →
  Personal access tokens. On Windows, Git Credential Manager caches this after
  the first successful push, so it isn't re-prompted every time.
- Claude Code (or any recursive/forced delete via its Bash/PowerShell tools)
  may get blocked by an auto-mode safety classifier on Windows regardless of
  user instruction in chat — this is a separate guardrail from normal
  permission prompts. If it happens, the user needs to run the delete
  themselves (or approve it through whatever prompt their permission mode
  shows); it's not something to keep retrying around.

## Environment variables

| Variable | Purpose | Where |
|---|---|---|
| `GOOGLE_SERVICE_ACCOUNT_KEY` | Service-account JSON for Sheets + Calendar API access | Vercel (prod), `.env` (local dev, gitignored) |
| `TODOIST_API_TOKEN` | User's personal Todoist API token, for two-way sync | Vercel (prod), `.env` (local dev, gitignored) |

## Current feature set (as of latest push)

- Smart capture box → auto-classifies into Task / Event / Recurring / Note,
  Todoist-first (see Integrations above)
- Tasks tab with Todoist sync badge + manual "Sync Todoist" button
- Events tab with monthly calendar view
- Daily Routine tab (time-blocked recurring items, optional auto-calendar-add,
  supports unspecified-time entries)
- Notes & Journal with a lightweight rich-text toolbar
- Shop with equippable cosmetic items reflected on the Home screen avatar
- XP/leveling system driving Mossback (dinosaur) evolution stages, with a
  redesigned XP bar and Home background
- Focus Timer with variable XP crediting (component built, not yet placed
  in the UI — see "Focus Timer + XP" above)
- Subtle idle sway animation on the companion (see "Companion animation" above)
- Settings page shows Todoist connection status (production vs. not configured)

## Brainstormed but NOT yet built

The user and a prior assistant session discussed (idea stage only, nothing
implemented) adding a **daily check-in ritual** inspired by the app
"Drynosaur" (a sobriety-tracking app where daily check-ins build a streak that
evolves a pet). Direction settled on so far, if picked back up:

- Tie check-in items to the existing `🔁 Daily Routine` tab rather than a
  separate habit list — add an `include in check-in` toggle and a `type`
  (do / avoid) flag per routine row, and a proper day-by-day completion log
  (routine currently only stores a single "Last Completed" date, not history).
- Hybrid XP model: completions trickle small XP into the main Mossback
  companion, but a separate streak/Era/milestone visual (its own card, not a
  second full pet) tracks the aggregate "on track" streak.
- Gentle-reset language on missed days (no hard streak-zero, no guilt framing).
- Still open: which specific routine items to include by default, and exact
  UI for the check-in ritual itself.

Also undecided: whether "Warm & Playful" (a Home-screen redesign mockup the
user approved in an earlier session) should replace the current theme
outright or become a switchable option, and whether/how far to extend that
redesign to Tasks/Events/Routine/Notes/Shop. Only Home was actually mocked up
and approved — don't assume it generalizes to list-heavy screens without
checking first.

## Sheet structure setup

`scripts/setup-sheet.ts` creates/verifies the pieces of Sheet structure the
app expects but can't create for itself at request time (Sheets tab creation
is a `batchUpdate` structural call, not something the app's normal
get/append/update/clear helpers in `server/lib/sheets.ts` do): the `⏱️ Focus
Log` tab (with its header row) and the `todoistId` header on the `✅ Tasks`
tab. Run it with `npx tsx scripts/setup-sheet.ts` (needs
`GOOGLE_SERVICE_ACCOUNT_KEY` in the environment, same as the server — reads
`.env` automatically). It's idempotent — safe to run again any time, e.g.
after rebuilding the Sheet from scratch, or just to confirm structure is
correct. Already run once against the live Sheet; both pieces exist there
now.

Note for future "can Claude just edit the Sheet directly" questions: this
script is why the answer is yes for anything the Sheets API supports — it
reuses the same service-account credentials the running app uses, just
called directly from a one-off script instead of through an HTTP route. It's
a different thing from browser automation (an AI clicking around a
logged-in Google Sheets tab in an actual browser) — no browser involved
here, just a direct API call.
