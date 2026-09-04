import { extractScheduleTime, type SchedulePeriod } from "./classify.js";

export interface ScheduleItem {
  id: string;
  text: string;
  time: string | null; // HH:mm, 24h
  displayTime: string | null; // e.g. "7:30 AM"
  period: SchedulePeriod | null;
}

// Same separators the "Plan My Day" mic dialog uses to break a spoken
// transcript into individual items (commas, "and"/"and then"/"then",
// periods, newlines) — kept in sync with the client-side fallback parser.
function splitTranscript(transcript: string): string[] {
  return transcript
    .split(/,|\.|\n|\band then\b|\bthen\b|\band\b/gi)
    .map((s) => s.trim())
    .filter((s) => s.length > 2);
}

function to12h(time: string): string {
  const [hStr, mStr] = time.split(":");
  let h = parseInt(hStr, 10);
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12;
  if (h === 0) h = 12;
  return `${h}:${mStr} ${ampm}`;
}

/**
 * Turns a raw spoken "Plan My Day" transcript into a clean, time-ordered
 * daily schedule: splits it into items, detects any explicit clock time per
 * item via chrono-node, and sorts timed items chronologically ahead of
 * untimed ("anytime") items, which keep their spoken order.
 */
export function buildDailySchedule(transcript: string, now: Date = new Date()): ScheduleItem[] {
  const rawItems = splitTranscript(transcript);
  const items: ScheduleItem[] = rawItems.map((raw, idx) => {
    const { time, cleanText, period } = extractScheduleTime(raw, now);
    return {
      id: `${idx}`,
      text: cleanText || raw,
      time,
      displayTime: time ? to12h(time) : null,
      period,
    };
  });

  return items
    .map((item, idx) => ({ item, idx }))
    .sort((a, b) => {
      const at = a.item.time;
      const bt = b.item.time;
      if (at && bt) return at.localeCompare(bt);
      if (at && !bt) return -1;
      if (!at && bt) return 1;
      return a.idx - b.idx; // preserve spoken order among untimed items
    })
    .map(({ item }) => item);
}
