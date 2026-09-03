// scripts/setup-sheet.ts
//
// One-off (but safely re-runnable) setup script that creates the pieces of
// Sheet structure the app expects but can't create for itself at runtime:
// the "todoistId" header on the Tasks tab, and the "Focus Log" tab (with its
// header row) used by the Focus timer's session logging. Safe to run again
// later — every step checks current state first and skips if already correct.
//
// Run with: npx tsx scripts/setup-sheet.ts
// Requires GOOGLE_SERVICE_ACCOUNT_KEY in the environment (loaded from .env
// automatically, same as the server).

import "dotenv/config";
import { getSheetsClient } from "../server/lib/google-auth.js";
import { updateRow, getValues, TABS, SPREADSHEET_ID } from "../server/lib/sheets.js";

async function ensureTodoistIdHeader() {
  const current = await getValues(TABS.TASKS, "I1");
  const value = current[0]?.[0];
  if (value === "todoistId") {
    console.log("Tasks!I1 already says 'todoistId' — nothing to do.");
    return;
  }
  await updateRow(TABS.TASKS, "I1", ["todoistId"]);
  console.log(`Set Tasks!I1 to 'todoistId' (was: ${JSON.stringify(value ?? "")})`);
}

async function ensureFocusLogTab() {
  const sheets = getSheetsClient();
  const meta = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
  const exists = meta.data.sheets?.some((s) => s.properties?.title === TABS.FOCUS_LOG);

  if (!exists) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SPREADSHEET_ID,
      requestBody: {
        requests: [{ addSheet: { properties: { title: TABS.FOCUS_LOG } } }],
      },
    });
    console.log(`Created tab "${TABS.FOCUS_LOG}".`);
  } else {
    console.log(`Tab "${TABS.FOCUS_LOG}" already exists.`);
  }

  const headerRow = ["timestamp", "durationMinutes", "completed", "taskRow", "taskText", "xpAwarded"];
  const currentHeader = await getValues(TABS.FOCUS_LOG, "A1:F1");
  const headerMatches = headerRow.every((h, i) => currentHeader[0]?.[i] === h);
  if (headerMatches) {
    console.log("Focus Log header row already correct — nothing to do.");
    return;
  }
  await updateRow(TABS.FOCUS_LOG, "A1:F1", headerRow);
  console.log("Wrote Focus Log header row.");
}

async function main() {
  await ensureTodoistIdHeader();
  await ensureFocusLogTab();
  console.log("Done.");
}

main().catch((err) => {
  console.error("setup-sheet failed:", err);
  process.exit(1);
});
