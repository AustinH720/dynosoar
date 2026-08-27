# DynoSOAR Command Center — update package

This zip contains every file that changed since your last push (`73359e0`) — the
Notes edit/delete update you hadn't pushed yet, plus this round's full feature
bundle. All files were built and QA-tested end-to-end against a live server
and the real Google Sheet before packaging.

## How to apply

1. Unzip this into your project folder, replacing the matching files:
   - Windows: `F:\Projects\DynoSOAR\DynoSOAR Command Center - source`
   - Mac: wherever you cloned `https://github.com/AustinH720/dynosoar.git`
2. Every file in this zip maps 1:1 to the same relative path in your project
   (e.g. `client/src/pages/routine.tsx` → `<project>/client/src/pages/routine.tsx`).
   Overwrite, don't merge.
3. From the project root:
   ```
   git add .
   git commit -m "Add Routine tab, XP/coin popup, event editing, NL cancellation, Notes edit/delete"
   git push
   ```
4. Vercel auto-redeploys on push. Give it a minute, then reload
   [dynosoar.vercel.app](https://dynosoar.vercel.app/#/).

## One manual step required: add a Google Sheet column

The Events tab needed a new column to remember each event's real Google
Calendar ID so edits/deletes can sync back to your calendar. I already added
it to your live Sheet, but note it here in case you ever rebuild the sheet
from scratch:

- **Events tab, column I** — header `Event ID`

Nothing else needs to change in the Sheet.

## What's new

### 1. Routine tab
A full "Routine" tab (bottom nav) for recurring habits/schedule blocks:
- **List view** — every routine item with time, day badges (e.g. "Mon–Fri",
  "Daily", "Weekends"), category, and a "Today" badge when it's scheduled today.
- **Add** (orange + button) — Activity, Time, Category, day presets
  ("Every day" / "Weekdays" / "Weekends") plus a 7-day toggle picker for
  custom schedules, and optional notes.
- **Edit** — tap any item to open it pre-filled; change anything and Save.
- **Delete** — trash icon inside the edit dialog, with a confirm-before-delete
  dialog so nothing is removed by accident.

### 2. XP/coin popup
Completing a task or a routine item now shows a floating "+XP / +coins"
badge at the top of the screen (auto-dismisses after ~2 seconds), in addition
to the toast notification. Wired into: task checkboxes (Tasks page and
Home's "Today" list) and routine checkboxes (Home's "Today's Routine" list).

### 3. Event editing
Tap any event on the Events page (or the "Today" cards on Home) to open an
edit dialog:
- Edit Title, Date, Start time, End time, Location.
- **Save** updates the Google Sheet, and if that event has a real linked
  Google Calendar entry, updates the calendar event too.
- If an event has no linked calendar entry (see note below), the dialog
  tells you so and saves to the list only — no silent failure.
- **Delete** (trash icon) asks for confirmation, then removes the row (and
  the calendar event, if linked).
- The external-link icon next to each event still opens Google Calendar
  directly and no longer accidentally opens the edit dialog too.

**Note on your 4 existing events:** they were created before this update
added the "Event ID" tracking column, so none of them have a stored calendar
ID yet. Editing or deleting them updates your Events list correctly, but
won't touch Google Calendar — the app tells you this in the dialog every
time. Any event created or auto-detected from now on will have full
two-way sync.

### 4. Natural-language event cancellation
Typing something like "I want to cancel my call mortgage broker renewal" or
"cancel my dentist appointment" into the home capture box now finds the best
matching upcoming event, removes it from your Events list, and deletes it
from Google Calendar if it was linked — no need to open the Events page.
Tested live: creating a throwaway event and cancelling it by phrase worked
correctly and cleaned up both the Sheet row and the calendar entry.

### 5. Notes edit/delete (carried over, not yet pushed before this)
The Notes page fix from before this round is included here too: notes can
be edited and deleted, and the mobile layout overflow bug on that page was
fixed.

## Bug fixed along the way (not requested, found during QA)

Two related time-formatting bugs were found and fixed during testing:

- **Day-range parsing:** routine items using a written range like "Mon–Fri"
  were only being matched for Monday and Friday, silently dropping
  Tuesday/Wednesday/Thursday from "Today's Routine" on those days.
- **Time zero-padding:** Google Sheets sometimes hands back a time like
  "9:00" instead of "09:00" after storing it. The Routine and Events edit
  dialogs use a time input that requires the zero-padded form, so times
  like "9:00" or "8:15" were showing up blank when you opened Edit. Every
  time value read from the Sheet is now normalized to the zero-padded form
  before it reaches the app, so Edit dialogs always pre-fill correctly.

## Known limitations (not fixed this round, flagged for visibility)

- Add/Edit dialogs on Tasks and the duplicate-detection dialog on Home
  weren't checked for the same mobile-overflow issue that was fixed on
  Notes. Let me know if you spot it there too.
