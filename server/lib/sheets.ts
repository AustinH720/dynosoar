import { execFile } from "node:child_process";
import { getSheetsClient } from "./google-auth.js";

const SPREADSHEET_ID = "18VEXw4UYNqPza7jGoUzgRDGBxHtxlHtZqf-YjpwLErY";

// Two auth paths:
// 1. GOOGLE_SERVICE_ACCOUNT_KEY set (production/Vercel) -> googleapis client
//    with a service account credential that auto-refreshes, no expiry.
// 2. Not set (this sandbox during development) -> fall back to the gws CLI,
//    which uses the session-bound connector credential. This keeps the
//    sandbox preview working without requiring the service account key to
//    be present here too.
const useServiceAccount = !!process.env.GOOGLE_SERVICE_ACCOUNT_KEY;

function execGws(argv: string[], queryParams: object, body?: object): Promise<any> {
  return new Promise((resolve, reject) => {
    const full = [...argv, "--params", JSON.stringify(queryParams)];
    if (body !== undefined) {
      full.push("--json", JSON.stringify(body));
    }
    execFile(
      "gws",
      full,
      { maxBuffer: 1024 * 1024 * 20 },
      (err, stdout, stderr) => {
        if (err) {
          reject(new Error(stderr?.toString() || err.message));
          return;
        }
        try {
          resolve(stdout ? JSON.parse(stdout.toString()) : {});
        } catch (e) {
          reject(new Error(`Failed to parse gws output: ${stdout}`));
        }
      },
    );
  });
}

function quoteRange(tab: string, a1: string) {
  return `'${tab}'!${a1}`;
}

export async function getValues(tab: string, a1Range: string): Promise<string[][]> {
  if (useServiceAccount) {
    const sheets = getSheetsClient();
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: quoteRange(tab, a1Range),
    });
    return (res.data.values as string[][]) || [];
  }
  const res = await execGws(["sheets", "spreadsheets", "values", "get"], {
    spreadsheetId: SPREADSHEET_ID,
    range: quoteRange(tab, a1Range),
  });
  return res.values || [];
}

export async function appendRow(tab: string, row: any[]): Promise<any> {
  if (useServiceAccount) {
    const sheets = getSheetsClient();
    const res = await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: quoteRange(tab, "A1"),
      valueInputOption: "USER_ENTERED",
      insertDataOption: "INSERT_ROWS",
      requestBody: { values: [row] },
    });
    return res.data;
  }
  return execGws(
    ["sheets", "spreadsheets", "values", "append"],
    {
      spreadsheetId: SPREADSHEET_ID,
      range: quoteRange(tab, "A1"),
      valueInputOption: "USER_ENTERED",
      insertDataOption: "INSERT_ROWS",
    },
    { values: [row] },
  );
}

export async function updateRow(tab: string, a1Range: string, row: any[]): Promise<any> {
  if (useServiceAccount) {
    const sheets = getSheetsClient();
    const res = await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: quoteRange(tab, a1Range),
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [row] },
    });
    return res.data;
  }
  return execGws(
    ["sheets", "spreadsheets", "values", "update"],
    {
      spreadsheetId: SPREADSHEET_ID,
      range: quoteRange(tab, a1Range),
      valueInputOption: "USER_ENTERED",
    },
    { values: [row] },
  );
}

export async function clearRange(tab: string, a1Range: string): Promise<any> {
  if (useServiceAccount) {
    const sheets = getSheetsClient();
    const res = await sheets.spreadsheets.values.clear({
      spreadsheetId: SPREADSHEET_ID,
      range: quoteRange(tab, a1Range),
    });
    return res.data;
  }
  return execGws(
    ["sheets", "spreadsheets", "values", "clear"],
    {
      spreadsheetId: SPREADSHEET_ID,
      range: quoteRange(tab, a1Range),
    },
    {},
  );
}

export interface AppSettings {
  themeMode: "Light" | "Dark" | "System";
  accentColor: string;
  backgroundScene: string;
}

const SETTINGS_DEFAULTS: AppSettings = {
  themeMode: "System",
  accentColor: "indigo",
  backgroundScene: "field",
};

export async function getSettings(): Promise<AppSettings> {
  const values = await getValues(TABS.PLAYER, "I2:K2");
  const row = values[0] ?? [];
  return {
    themeMode: (row[0] as AppSettings["themeMode"]) || SETTINGS_DEFAULTS.themeMode,
    accentColor: row[1] || SETTINGS_DEFAULTS.accentColor,
    backgroundScene: row[2] || SETTINGS_DEFAULTS.backgroundScene,
  };
}

export async function updateSettings(patch: Partial<AppSettings>): Promise<AppSettings> {
  const current = await getSettings();
  const next: AppSettings = { ...current, ...patch };
  await updateRow(TABS.PLAYER, "I2:K2", [next.themeMode, next.accentColor, next.backgroundScene]);
  return next;
}

// Google Sheets (USER_ENTERED) auto-parses "09:15" as a time value and can hand it back
// via FORMATTED_VALUE without the leading zero (e.g. "9:15"). <input type="time"> requires a
// strict zero-padded "HH:MM", so every time-like cell read from a sheet must pass through this
// before being sent to the frontend.
export function normalizeTime(value: string | undefined | null): string {
  if (!value) return "";
  const trimmed = value.trim();
  const match = trimmed.match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(am|pm|AM|PM)?$/);
  if (!match) return trimmed;
  let hour = parseInt(match[1], 10);
  const minute = match[2];
  const meridiem = match[3]?.toLowerCase();
  if (meridiem === "pm" && hour < 12) hour += 12;
  if (meridiem === "am" && hour === 12) hour = 0;
  if (hour > 23 || hour < 0) return trimmed;
  return `${String(hour).padStart(2, "0")}:${minute}`;
}

export const TABS = {
  INBOX: "📥 Inbox (Capture Here)",
  TASKS: "✅ Tasks",
  EVENTS: "📅 Events",
  ROUTINE: "🔁 Daily Routine",
  NOTES: "📝 Notes & Journal",
  LOG: "⚙️ Automation Log",
  PLAYER: "🦖 Player",
  XP_LEDGER: "✨ XP Ledger",
  SHOP: "🛍️ Shop",
} as const;
