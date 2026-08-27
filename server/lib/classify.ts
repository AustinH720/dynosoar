import * as chrono from "chrono-node";

export type EntryType = "Event" | "Task" | "Note" | "Recurring";

export interface Classification {
  type: EntryType;
  // Event fields
  eventDate?: string; // YYYY-MM-DD
  startTime?: string; // HH:mm
  endTime?: string; // HH:mm
  location?: string | null;
  // Task fields
  dueDate?: string | null; // YYYY-MM-DD
  priority?: "High" | "Medium";
  category?: string;
  // Recurring
  rrule?: string;
  cadenceLabel?: string;
}

const RECURRING_PATTERNS: { re: RegExp; label: string; rrule: string }[] = [
  { re: /\bevery\s+day\b|\bdaily\b|\beach\s+day\b|\bevery\s+morning\b|\bevery\s+evening\b|\bevery\s+night\b/i, label: "Daily", rrule: "RRULE:FREQ=DAILY" },
  { re: /\bevery\s+weekday\b|\bweekdays\b/i, label: "Weekdays", rrule: "RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR" },
  { re: /\bevery\s+weekend\b|\bweekends\b/i, label: "Weekends", rrule: "RRULE:FREQ=WEEKLY;BYDAY=SA,SU" },
  { re: /\bevery\s+(mon|tues|wednes|thurs|fri|satur|sun)day\b/i, label: "Weekly", rrule: "RRULE:FREQ=WEEKLY" },
  { re: /\bevery\s+month\b|\bmonthly\b/i, label: "Monthly", rrule: "RRULE:FREQ=MONTHLY" },
  { re: /\bevery\s+week\b|\bweekly\b|\beach\s+week\b/i, label: "Weekly", rrule: "RRULE:FREQ=WEEKLY" },
];

const WEEKDAY_CODES: Record<string, { code: string; label: string }> = {
  mon: { code: "MO", label: "Monday" },
  tues: { code: "TU", label: "Tuesday" },
  wednes: { code: "WE", label: "Wednesday" },
  thurs: { code: "TH", label: "Thursday" },
  fri: { code: "FR", label: "Friday" },
  satur: { code: "SA", label: "Saturday" },
  sun: { code: "SU", label: "Sunday" },
};
const SPECIFIC_WEEKDAY_RE = /\bevery\s+(mon|tues|wednes|thurs|fri|satur|sun)day\b/i;

const DEFAULT_RECURRING_TIME = "09:00";
const DEFAULT_RECURRING_DURATION_MIN = 30;

const ACTION_VERBS =
  /^(call|email|apply|submit|finish|review|book|buy|schedule|follow up|send|pay|renew|prepare|draft|update|fix|clean|organize|research|study|practice|read|write|plan|check|confirm|cancel|reschedule|remind me to|need to|todo|to-do|task)\b/i;

const URGENT_WORDS = /\b(asap|urgent|today|immediately|right away|critical)\b/i;

const CATEGORY_RULES: { re: RegExp; label: string }[] = [
  { re: /\b(interview|resume|cover letter|job|recruit|apply|application|linkedin|career)\b/i, label: "Job Search" },
  { re: /\b(real estate|license|realtor|property|listing|closing|mls)\b/i, label: "Real Estate" },
  { re: /\b(workout|gym|run|exercise|yoga|training)\b/i, label: "Fitness" },
  { re: /\b(client|consulting|deliverable|deck|proposal|stakeholder)\b/i, label: "Consulting" },
  { re: /\b(rent|bill|bank|invoice|tax|budget)\b/i, label: "Finance" },
];

function guessCategory(text: string): string {
  for (const rule of CATEGORY_RULES) {
    if (rule.re.test(text)) return rule.label;
  }
  return "General";
}

/**
 * Detects a leading "Project: rest of entry" or "Project - rest of entry" prefix,
 * e.g. "Fish: water change" or "Fish - clean glass". Used to group tasks/notes
 * under a project. Returns the original text unchanged if no prefix is found.
 */
export function extractProject(text: string): { project: string | null; rest: string } {
  const m = text.match(/^([A-Za-z][A-Za-z0-9 &'/]{1,28}?)\s*[:\-–—]\s+(.+)$/);
  if (m && m[2].trim().length > 0) {
    return { project: m[1].trim(), rest: m[2].trim() };
  }
  return { project: null, rest: text };
}

function fmtDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function fmtTime(d: Date): string {
  const h = String(d.getHours()).padStart(2, "0");
  const m = String(d.getMinutes()).padStart(2, "0");
  return `${h}:${m}`;
}

export function classify(text: string, now: Date = new Date()): Classification {
  const trimmed = text.trim();

  for (const pat of RECURRING_PATTERNS) {
    if (pat.re.test(trimmed)) {
      // If "every <weekday>" is present, lock the RRULE to that specific day
      // and use a human label that names the day (e.g. "Weekly (Wed)") instead
      // of a generic placeholder — needed so both the calendar series and the
      // routine checklist land on the right day.
      let rrule = pat.rrule;
      let label = pat.label;
      const dayMatch = trimmed.match(SPECIFIC_WEEKDAY_RE);
      if (dayMatch) {
        const key = dayMatch[1].toLowerCase();
        const wd = WEEKDAY_CODES[key];
        if (wd) {
          rrule = `RRULE:FREQ=WEEKLY;BYDAY=${wd.code}`;
          label = `Weekly (${wd.label.slice(0, 3)})`;
        }
      }

      const timeResults = chrono.parse(trimmed, now, { forwardDate: true });
      const withTime = timeResults.find((r) => r.start.isCertain("hour"));

      let startDate: Date;
      let endDate: Date;
      if (withTime) {
        startDate = withTime.start.date();
        endDate = withTime.end
          ? withTime.end.date()
          : new Date(startDate.getTime() + DEFAULT_RECURRING_DURATION_MIN * 60 * 1000);
      } else {
        // No explicit time — anchor on the next matching date chrono found
        // (e.g. "Wednesday" -> next Wednesday), or today if it found none,
        // and apply a sensible default time so the entry can always get a
        // real calendar slot and a due date on the Tasks list.
        const anyDateResult = timeResults[0];
        const anchor = anyDateResult ? anyDateResult.start.date() : new Date(now);
        const [dh, dm] = DEFAULT_RECURRING_TIME.split(":").map(Number);
        startDate = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate(), dh, dm);
        endDate = new Date(startDate.getTime() + DEFAULT_RECURRING_DURATION_MIN * 60 * 1000);
      }

      return {
        type: "Recurring",
        rrule,
        cadenceLabel: label,
        eventDate: fmtDate(startDate),
        startTime: fmtTime(startDate),
        endTime: fmtTime(endDate),
        category: guessCategory(trimmed),
      };
    }
  }

  const results = chrono.parse(trimmed, now, { forwardDate: true });

  if (results.length > 0) {
    const r = results[0];
    const start = r.start;
    const hasTime = start.isCertain("hour");
    const startDate = start.date();

    if (hasTime) {
      let endDate: Date;
      if (r.end) {
        endDate = r.end.date();
      } else {
        endDate = new Date(startDate.getTime() + 30 * 60 * 1000);
      }
      return {
        type: "Event",
        eventDate: fmtDate(startDate),
        startTime: fmtTime(startDate),
        endTime: fmtTime(endDate),
        location: null,
        category: guessCategory(trimmed),
      };
    } else {
      return {
        type: "Task",
        dueDate: fmtDate(startDate),
        priority: URGENT_WORDS.test(trimmed) ? "High" : "Medium",
        category: guessCategory(trimmed),
      };
    }
  }

  if (ACTION_VERBS.test(trimmed) || /\bneed to\b|\bremember to\b|\btodo\b/i.test(trimmed)) {
    return {
      type: "Task",
      dueDate: null,
      priority: URGENT_WORDS.test(trimmed) ? "High" : "Medium",
      category: guessCategory(trimmed),
    };
  }

  return { type: "Note", category: guessCategory(trimmed) };
}
