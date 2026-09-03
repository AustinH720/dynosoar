import * as chrono from "chrono-node";
import type { TodoistTask } from "./todoist.js";

export type EntryType = "Event" | "Task" | "Note" | "Recurring";

export interface Classification {
  type: EntryType;
  // Event fields
  eventDate?: string; // YYYY-MM-DD
  startTime?: string; // HH:mm
  endTime?: string; // HH:mm
  location?: string | null;
  // Event/Recurring title with the recognized date/time phrase removed,
  // e.g. "Akira movie September 8 at 7pm" -> "Akira movie". Falls back to
  // the original text if stripping would leave nothing usable.
  cleanTitle?: string;
  // Task fields
  dueDate?: string | null; // YYYY-MM-DD
  priority?: "High" | "Medium";
  category?: string;
  // Recurring
  rrule?: string;
  cadenceLabel?: string;
  // True when the entry included an explicit clock time ("at 7pm"). When
  // false, the recurring routine has no fixed time block — it's a
  // general/any-time habit (e.g. "water change on Wednesday") and should
  // not get a forced default time or a timed calendar event.
  hasExplicitTime?: boolean;
  // Set when this classification came from Todoist's Quick Add parse
  // rather than (or in addition to) the local heuristic, so the capture
  // route knows to persist the linked Todoist task id.
  todoistId?: string;
  // Set when Todoist parsing was attempted but failed/timed out and this
  // classification is a manual-fix fallback (see classifyFromTodoist).
  todoistFallback?: boolean;
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

/**
 * Removes the exact date/time phrase chrono matched (e.g. "September 8 at
 * 7pm") from the raw entry text, then trims any dangling connector words
 * left behind ("movie at", "lunch on", trailing commas) so the remaining
 * text reads as a clean event title. Falls back to the original text if
 * stripping would leave nothing (or only punctuation) behind.
 */
function stripDateTimePhrase(text: string, matchedText: string): string {
  let result = text.replace(matchedText, " ").replace(/\s{2,}/g, " ").trim();
  // Drop a connector word left dangling at the very end or start of the
  // remaining text ("Akira movie at" -> "Akira movie", "on Dinner" -> "Dinner").
  result = result.replace(/\s+(at|on|this|next|for)\s*$/i, "").trim();
  result = result.replace(/^(at|on|for)\s+/i, "").trim();
  result = result.replace(/\s*,\s*$/, "").replace(/^\s*,\s*/, "").trim();
  return result.length > 0 ? result : text;
}

/**
 * Derives an RRULE + human cadence label from free text (e.g. "every
 * Wednesday", "daily", "weekdays"). Shared by the local classify() path and
 * classifyFromTodoist() — Todoist tells us a task IS recurring but doesn't
 * hand back an RRULE, so we still need this regex pass over the text (or
 * Todoist's due.string) to get a calendar-compatible recurrence rule.
 * Returns null if no known cadence pattern matches.
 */
function deriveRrule(text: string): { rrule: string; label: string } | null {
  for (const pat of RECURRING_PATTERNS) {
    if (pat.re.test(text)) {
      let rrule = pat.rrule;
      let label = pat.label;
      const dayMatch = text.match(SPECIFIC_WEEKDAY_RE);
      if (dayMatch) {
        const key = dayMatch[1].toLowerCase();
        const wd = WEEKDAY_CODES[key];
        if (wd) {
          rrule = `RRULE:FREQ=WEEKLY;BYDAY=${wd.code}`;
          label = `Weekly (${wd.label.slice(0, 3)})`;
        }
      }
      return { rrule, label };
    }
  }
  return null;
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
      let endDate: Date | null = null;
      let hasExplicitTime = false;
      if (withTime) {
        hasExplicitTime = true;
        startDate = withTime.start.date();
        endDate = withTime.end
          ? withTime.end.date()
          : new Date(startDate.getTime() + DEFAULT_RECURRING_DURATION_MIN * 60 * 1000);
      } else {
        // No explicit time ("general", no clock time mentioned) — anchor on
        // the next matching date chrono found (e.g. "Wednesday" -> next
        // Wednesday), or today if it found none, but leave the time itself
        // unspecified rather than guessing a default. The routine gets no
        // fixed time block and no timed calendar event.
        const anyDateResult = timeResults[0];
        const anchor = anyDateResult ? anyDateResult.start.date() : new Date(now);
        startDate = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate());
      }

      return {
        type: "Recurring",
        rrule,
        cadenceLabel: label,
        eventDate: fmtDate(startDate),
        startTime: hasExplicitTime ? fmtTime(startDate) : undefined,
        endTime: hasExplicitTime && endDate ? fmtTime(endDate) : undefined,
        category: guessCategory(trimmed),
        hasExplicitTime,
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
        cleanTitle: stripDateTimePhrase(trimmed, r.text),
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

/**
 * Maps a Todoist Quick Add result onto DynoSOAR's Task/Event/Recurring/Note
 * buckets. This is the primary classification path when Todoist is
 * configured — the local chrono-based classify() above becomes a fallback,
 * used only when Todoist detected no date at all (to decide Task vs. Note,
 * since Todoist has no "note" concept) or when the Todoist call itself
 * failed (see the `todoistFallback` case, called separately by the capture
 * route — this function assumes the call succeeded).
 *
 * Mapping rules (confirmed):
 *   - due.is_recurring        -> Recurring
 *   - due.datetime present    -> Event   (Todoist parsed a specific time)
 *   - due.date, no datetime   -> Task    (Todoist parsed a date only)
 *   - due null                -> local classify() decides Task vs. Note
 */
export function classifyFromTodoist(
  todoistTask: TodoistTask,
  originalText: string,
  now: Date = new Date(),
): Classification {
  const { due } = todoistTask;
  const category = guessCategory(originalText);

  if (!due) {
    // Todoist found no date/recurrence in the text at all. Fall back to the
    // local heuristic, but constrain its result to Task/Note only — an
    // Event or Recurring classification without any date data from either
    // source isn't trustworthy.
    const local = classify(originalText, now);
    const type: EntryType = local.type === "Note" ? "Note" : "Task";
    return {
      type,
      dueDate: type === "Task" ? local.dueDate ?? null : undefined,
      priority: local.priority,
      category,
      todoistId: todoistTask.id,
    };
  }

  if (due.is_recurring) {
    // Todoist confirms recurrence but doesn't return an RRULE — derive one
    // from Todoist's human-readable cadence string (falls back to the raw
    // text if that doesn't match a known pattern either).
    const derived = deriveRrule(due.string) ?? deriveRrule(originalText) ?? {
      rrule: "RRULE:FREQ=WEEKLY",
      label: "Recurring",
    };
    let startDate: Date | null = null;
    let hasExplicitTime = false;
    if (due.datetime) {
      startDate = new Date(due.datetime);
      hasExplicitTime = true;
    } else if (due.date) {
      const [y, m, d] = due.date.split("-").map(Number);
      startDate = new Date(y, m - 1, d);
    }
    const endDate =
      hasExplicitTime && startDate
        ? new Date(startDate.getTime() + DEFAULT_RECURRING_DURATION_MIN * 60 * 1000)
        : null;
    return {
      type: "Recurring",
      rrule: derived.rrule,
      cadenceLabel: derived.label,
      eventDate: startDate ? fmtDate(startDate) : due.date,
      startTime: hasExplicitTime && startDate ? fmtTime(startDate) : undefined,
      endTime: hasExplicitTime && endDate ? fmtTime(endDate) : undefined,
      category,
      hasExplicitTime,
      todoistId: todoistTask.id,
    };
  }

  if (due.datetime) {
    const startDate = new Date(due.datetime);
    const endDate = new Date(startDate.getTime() + 30 * 60 * 1000);
    return {
      type: "Event",
      eventDate: fmtDate(startDate),
      startTime: fmtTime(startDate),
      endTime: fmtTime(endDate),
      location: null,
      category,
      cleanTitle: todoistTask.content || originalText,
      todoistId: todoistTask.id,
    };
  }

  // Date only, no specific time.
  return {
    type: "Task",
    dueDate: due.date,
    priority: URGENT_WORDS.test(originalText) ? "High" : "Medium",
    category,
    todoistId: todoistTask.id,
  };
}

/**
 * Fallback classification used by the capture route when the Todoist Quick
 * Add call itself fails or times out (network error, 5xx, timeout — not a
 * "Todoist found nothing" case, which is handled inside classifyFromTodoist
 * above). Per product decision: save as a Task with no date, flagged for
 * manual fix, rather than silently falling back to full local parsing or
 * failing the capture outright.
 */
export function classifyTodoistFailure(originalText: string): Classification {
  return {
    type: "Task",
    dueDate: null,
    priority: "Medium",
    category: guessCategory(originalText),
    todoistFallback: true,
  };
}
