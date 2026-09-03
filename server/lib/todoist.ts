// Todoist integration.
//
// Dual-path, mirroring the existing useServiceAccount pattern in sheets.ts
// and external.ts:
//   - Production (Vercel): TODOIST_API_TOKEN env var is set -> call the
//     official Todoist REST API directly with a Bearer token.
//   - Sandbox/dev preview: no token set -> fall back to the connected
//     Todoist integration available in this chat session, via the same
//     callExternalTool("todoist", ...) helper already used for Calendar.
//
// Every function fails soft (returns null/false/[] and logs) so a Todoist
// hiccup never breaks task capture, editing, or the app in general.

import { callExternalTool } from "./external.js";

const TODOIST_TOKEN = process.env.TODOIST_API_TOKEN;
const useDirectApi = !!TODOIST_TOKEN;
const API_BASE = "https://api.todoist.com/api/v1";

export function isTodoistConfigured(): boolean {
  return useDirectApi;
}

export interface TodoistTaskRef {
  id: string;
  content: string;
  dueDate: string; // YYYY-MM-DD, "" if none
  isRecurring: boolean;
  priority: "High" | "Medium";
}

export interface CreateTodoistTaskOpts {
  content: string;
  dueDate?: string | null; // exact YYYY-MM-DD
  dueDatetime?: string | null; // exact ISO 8601 datetime (with offset)
  dueString?: string | null; // natural language — used for recurring cadence
  priority?: "High" | "Medium";
}

// Todoist's REST priority is an integer 1 (normal/default, shown as "P4" in
// the UI) to 4 (urgent, shown as "P1"). Our app only has two tiers, so High
// maps to "high" (3 / p2) and Medium maps to Todoist's own default (1 / p4).
function toApiPriority(level: "High" | "Medium"): number {
  return level === "High" ? 3 : 1;
}
function toConnectorPriority(level: "High" | "Medium"): "p2" | "p4" {
  return level === "High" ? "p2" : "p4";
}
function fromApiPriority(p?: number): "High" | "Medium" {
  return (p ?? 1) >= 3 ? "High" : "Medium";
}
function fromConnectorPriority(p?: string): "High" | "Medium" {
  return p === "p1" || p === "p2" ? "High" : "Medium";
}

async function directRequest(path: string, method: string, body?: Record<string, any>): Promise<any> {
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${TODOIST_TOKEN}`,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Todoist ${method} ${path} -> ${res.status}: ${text}`);
  }
  if (res.status === 204) return null;
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

// The connector's add-tasks tool only accepts a natural-language dueString,
// not a raw ISO datetime. Todoist's own parser reliably reads a loose
// "YYYY-MM-DD HH:mm" phrase, so strip the offset/"T" separator for that path.
function isoToLooseDateTimeString(iso: string): string {
  const m = iso.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/);
  return m ? `${m[1]} ${m[2]}` : iso;
}

function normalizeApiTask(t: any): TodoistTaskRef {
  return {
    id: String(t.id),
    content: t.content ?? "",
    dueDate: t.due?.date ?? "",
    isRecurring: !!t.due?.is_recurring,
    priority: fromApiPriority(t.priority),
  };
}
function normalizeConnectorTask(t: any): TodoistTaskRef {
  return {
    id: String(t.id),
    content: t.content ?? "",
    dueDate: (t.dueDate ?? "").slice(0, 10),
    isRecurring: !!t.recurring,
    priority: fromConnectorPriority(t.priority),
  };
}

/** Build a Todoist-parseable recurrence phrase from our own classify() output,
 *  so Todoist's own recurrence engine (auto-advancing due dates, its mobile
 *  app, etc.) owns the cadence going forward. */
export function cadenceToDueString(cadenceLabel: string, rrule?: string, startTime?: string): string {
  const DAY_NAMES: Record<string, string> = {
    MO: "monday",
    TU: "tuesday",
    WE: "wednesday",
    TH: "thursday",
    FR: "friday",
    SA: "saturday",
    SU: "sunday",
  };
  let phrase = "every week";
  const dayMatch = rrule?.match(/BYDAY=([A-Z]{2})(?:;|$)/);
  if (dayMatch && DAY_NAMES[dayMatch[1]] && !/,/.test(rrule?.split("BYDAY=")[1] ?? "")) {
    phrase = `every ${DAY_NAMES[dayMatch[1]]}`;
  } else if (/daily/i.test(cadenceLabel)) {
    phrase = "every day";
  } else if (/weekday/i.test(cadenceLabel)) {
    phrase = "every weekday";
  } else if (/weekend/i.test(cadenceLabel)) {
    phrase = "every sat, sun";
  } else if (/monthly/i.test(cadenceLabel)) {
    phrase = "every month";
  } else if (/weekly/i.test(cadenceLabel)) {
    phrase = "every week";
  }
  if (startTime) {
    const [h, m] = startTime.split(":").map((n) => parseInt(n, 10));
    if (!Number.isNaN(h)) {
      const period = h >= 12 ? "pm" : "am";
      const h12 = h % 12 === 0 ? 12 : h % 12;
      phrase += ` at ${h12}${m ? ":" + String(m).padStart(2, "0") : ""}${period}`;
    }
  }
  return phrase;
}

export async function createTodoistTask(opts: CreateTodoistTaskOpts): Promise<TodoistTaskRef | null> {
  const priority = opts.priority ?? "Medium";
  try {
    if (useDirectApi) {
      const body: Record<string, any> = { content: opts.content, priority: toApiPriority(priority) };
      if (opts.dueString) body.due_string = opts.dueString;
      else if (opts.dueDatetime) body.due_datetime = opts.dueDatetime;
      else if (opts.dueDate) body.due_date = opts.dueDate;
      const task = await directRequest("/tasks", "POST", body);
      return task ? normalizeApiTask(task) : null;
    }
    const connectorDueString = opts.dueString ?? (opts.dueDatetime ? isoToLooseDateTimeString(opts.dueDatetime) : opts.dueDate ?? undefined);
    const result = await callExternalTool("todoist", "add-tasks", {
      tasks: [
        {
          content: opts.content,
          priority: toConnectorPriority(priority),
          ...(connectorDueString ? { dueString: connectorDueString } : {}),
        },
      ],
    });
    const raw = result?.tasks?.[0];
    return raw ? normalizeConnectorTask(raw) : null;
  } catch (err) {
    console.error("Todoist createTask failed:", (err as Error).message);
    return null;
  }
}

export interface QuickAddResult {
  todoistId: string;
  content: string;
  priority: number; // raw Todoist 1 (default) - 4 (urgent)
  dueDate: string | null; // YYYY-MM-DD, all-day
  dueDatetime: string | null; // UTC ISO, exact time
  isRecurring: boolean;
  dueString: string | null; // Todoist's own normalized phrase, e.g. "every mon"
}

/**
 * Hands the raw capture text straight to Todoist's own Quick Add parser
 * (the same NLP engine behind Todoist's own apps) instead of our local
 * chrono-node classifier. This both creates the Todoist task AND returns
 * the parsed due date/time/recurrence, so classify.ts's job shrinks down to
 * turning Todoist's answer into our Task/Event/Recurring bucket.
 *
 * Direct-API (production) only — the connected sandbox Todoist integration
 * has no Quick Add equivalent, so this returns null there and callers should
 * fall back to the local classify() parser exactly as before.
 */
export async function quickAddTodoistTask(text: string): Promise<QuickAddResult | null> {
  if (!useDirectApi || !text.trim()) return null;
  try {
    const task = await directRequest("/tasks/quick", "POST", { text, meta: true });
    if (!task || !task.id) return null;
    const due = task.due ?? null;
    return {
      todoistId: String(task.id),
      content: typeof task.content === "string" && task.content.trim() ? task.content.trim() : text,
      priority: typeof task.priority === "number" ? task.priority : 1,
      dueDate: due?.date ?? null,
      dueDatetime: due?.datetime ?? null,
      isRecurring: !!due?.is_recurring,
      dueString: due?.string ?? null,
    };
  } catch (err) {
    console.error("Todoist quickAdd failed:", (err as Error).message);
    return null;
  }
}

/**
 * Quick Add always creates a real Todoist task, even when our own classifier
 * later decides the entry is really a plain Note (Todoist has no "note"
 * concept). Best-effort cleanup so those don't linger in the user's Todoist
 * as stray, date-less tasks. Direct-API only, matching quickAddTodoistTask.
 */
export async function deleteTodoistTask(id: string): Promise<boolean> {
  if (!id || !useDirectApi) return false;
  try {
    await directRequest(`/tasks/${id}`, "DELETE");
    return true;
  } catch (err) {
    console.error("Todoist deleteTask failed:", (err as Error).message);
    return false;
  }
}

export async function completeTodoistTask(id: string): Promise<boolean> {
  if (!id) return false;
  try {
    if (useDirectApi) {
      await directRequest(`/tasks/${id}/close`, "POST");
      return true;
    }
    const result = await callExternalTool("todoist", "complete-tasks", { ids: [id] });
    return (result?.successCount ?? 0) > 0;
  } catch (err) {
    console.error("Todoist completeTask failed:", (err as Error).message);
    return false;
  }
}

export async function reopenTodoistTask(id: string): Promise<boolean> {
  if (!id) return false;
  try {
    if (useDirectApi) {
      await directRequest(`/tasks/${id}/reopen`, "POST");
      return true;
    }
    const result = await callExternalTool("todoist", "uncomplete-tasks", { ids: [id] });
    return (result?.successCount ?? 0) > 0;
  } catch (err) {
    console.error("Todoist reopenTask failed:", (err as Error).message);
    return false;
  }
}

export async function updateTodoistTask(
  id: string,
  fields: { content?: string; dueDate?: string | null; priority?: "High" | "Medium" },
): Promise<boolean> {
  if (!id) return false;
  try {
    if (useDirectApi) {
      const body: Record<string, any> = {};
      if (fields.content !== undefined) body.content = fields.content;
      if (fields.priority !== undefined) body.priority = toApiPriority(fields.priority);
      if (fields.dueDate !== undefined) body.due_date = fields.dueDate || null;
      await directRequest(`/tasks/${id}`, "POST", body);
      return true;
    }
    const task: Record<string, any> = { id };
    if (fields.content !== undefined) task.content = fields.content;
    if (fields.priority !== undefined) task.priority = toConnectorPriority(fields.priority);
    if (fields.dueDate !== undefined) task.dueString = fields.dueDate || "remove";
    const result = await callExternalTool("todoist", "update-tasks", { tasks: [task] });
    return (result?.successCount ?? 0) > 0;
  } catch (err) {
    console.error("Todoist updateTask failed:", (err as Error).message);
    return false;
  }
}

export async function listOpenTodoistTasks(): Promise<TodoistTaskRef[]> {
  try {
    if (useDirectApi) {
      const tasks = await directRequest("/tasks", "GET");
      const list = Array.isArray(tasks) ? tasks : tasks?.results ?? [];
      return list.map(normalizeApiTask);
    }
    // Sandbox parity only: the connector's find-tasks requires at least one
    // filter, so this wide window approximates "everything active" for
    // testing here. Production always uses the unfiltered GET /tasks above.
    const result = await callExternalTool("todoist", "find-tasks", {
      filter: "(no due date | overdue | due before: 2099-12-31)",
      limit: 100,
    });
    const raw = result?.tasks ?? [];
    return raw.map(normalizeConnectorTask);
  } catch (err) {
    console.error("Todoist listOpenTasks failed:", (err as Error).message);
    return [];
  }
}
