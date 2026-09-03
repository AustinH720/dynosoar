export const APP_TZ = "America/Toronto";

function getTzOffset(dateStr: string, timeZone: string): string {
  const approx = new Date(`${dateStr}T12:00:00Z`);
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    timeZoneName: "longOffset",
  });
  const parts = dtf.formatToParts(approx);
  const tzName = parts.find((p) => p.type === "timeZoneName")?.value ?? "GMT+00:00";
  const offset = tzName.replace("GMT", "");
  return offset === "" ? "+00:00" : offset;
}

/** Builds an ISO 8601 string with the correct America/Toronto UTC offset for a given local date/time. */
export function toIsoWithTz(dateStr: string, timeStr: string): string {
  const offset = getTzOffset(dateStr, APP_TZ);
  const [h, m = "00"] = timeStr.split(":");
  const paddedTime = `${h.padStart(2, "0")}:${m.padStart(2, "0")}`;
  return `${dateStr}T${paddedTime}:00${offset}`;
}

/**
 * Converts a UTC ISO datetime (e.g. Todoist's `due.datetime`, always returned
 * in UTC) into America/Toronto wall-clock date + time parts. Used when a
 * Todoist Quick Add response supplies the due date/time instead of our own
 * chrono-node parsing, so calendar events land on the correct local hour.
 */
export function utcIsoToAppTzParts(iso: string): { date: string; time: string } {
  const d = new Date(iso);
  const dateFmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: APP_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const timeFmt = new Intl.DateTimeFormat("en-US", {
    timeZone: APP_TZ,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const date = dateFmt.format(d);
  const parts = timeFmt.formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  let hour = get("hour");
  if (hour === "24") hour = "00";
  return { date, time: `${hour}:${get("minute")}` };
}

export function todayStr(): string {
  const now = new Date();
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: APP_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return fmt.format(now); // en-CA gives YYYY-MM-DD
}

/** Day of week in America/Toronto, 0=Sunday .. 6=Saturday. */
export function todayWeekday(): number {
  const now = new Date();
  const label = new Intl.DateTimeFormat("en-US", { timeZone: APP_TZ, weekday: "short" }).format(now);
  const idx = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(label);
  return idx === -1 ? now.getDay() : idx;
}

export function nowInAppTz(): Date {
  // Returns a Date whose getFullYear/getMonth/etc reflect America/Toronto wall-clock time
  // by re-parsing a formatted string (safe for our date-only classification needs).
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: APP_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "0";
  return new Date(
    Number(get("year")),
    Number(get("month")) - 1,
    Number(get("day")),
    Number(get("hour")) === 24 ? 0 : Number(get("hour")),
    Number(get("minute")),
    Number(get("second")),
  );
}
