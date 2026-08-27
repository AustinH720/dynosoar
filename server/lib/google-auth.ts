import { google } from "googleapis";

// Loads Google service account credentials from the GOOGLE_SERVICE_ACCOUNT_KEY
// environment variable (the raw downloaded JSON key, stringified). This is a
// long-lived credential — googleapis handles token refresh internally, so
// there's no periodic expiry the way there is with a session-bound OAuth
// token. If this var is missing, calls will throw with a clear message
// instead of a cryptic auth error.
let cachedAuth: InstanceType<typeof google.auth.GoogleAuth> | null = null;

function getServiceAccountKey(): Record<string, any> {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (!raw) {
    throw new Error(
      "GOOGLE_SERVICE_ACCOUNT_KEY is not set. Add the service account JSON key as an environment variable.",
    );
  }
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error(
      "GOOGLE_SERVICE_ACCOUNT_KEY is not valid JSON. Paste the full contents of the downloaded key file.",
    );
  }
}

function getAuth() {
  if (!cachedAuth) {
    const credentials = getServiceAccountKey();
    cachedAuth = new google.auth.GoogleAuth({
      credentials,
      scopes: [
        "https://www.googleapis.com/auth/spreadsheets",
        "https://www.googleapis.com/auth/calendar",
      ],
    });
  }
  return cachedAuth;
}

export function getSheetsClient() {
  return google.sheets({ version: "v4", auth: getAuth() as any });
}

export function getCalendarClient() {
  return google.calendar({ version: "v3", auth: getAuth() as any });
}
