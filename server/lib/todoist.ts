// server/lib/todoist.ts
//
// Thin client for the Todoist REST API (v1), used for:
//   1. Quick Add on capture — sends raw capture text and lets Todoist's own
//      NLP parse dates/times/recurrence/#project/@label/p1-p4 syntax.
//   2. Closing a task in Todoist when it's completed in the app.
//   3. Pull sync — listing open Todoist tasks to reconcile against the Sheet.
//
// Auth: TODOIST_API_TOKEN env var (user's personal API token, same pattern
// as GOOGLE_SERVICE_ACCOUNT_KEY — set in Vercel for production).
//
// Sandbox/local-dev fallback: when no token is present, every function
// returns a deterministic MOCK response instead of throwing or hitting the
// network. This lets the capture/classify/sync logic be exercised and
// tested without a real Todoist account. Mock responses are clearly marked
// (`__mock: true`) so calling code / logs can tell the difference, and
// callers should treat mock mode as "not really configured" for anything
// user-facing (e.g. the Settings page connection status).

const TODOIST_API_BASE = "https://api.todoist.com/api/v1";

function getToken(): string | null {
  return process.env.TODOIST_API_TOKEN || null;
}

export function isTodoistConfigured(): boolean {
  return !!getToken();
}

export interface TodoistDue {
  date: string; // YYYY-MM-DD
  datetime?: string | null; // ISO 8601, present only if a specific time was parsed
  string: string; // human-readable, e.g. "every day", "tomorrow at 5pm"
  timezone?: string | null;
  is_recurring: boolean;
}

export interface TodoistTask {
  id: string;
  content: string;
  description?: string;
  is_completed: boolean;
  due: TodoistDue | null;
  priority: number; // 1 (normal) - 4 (urgent)
  project_id?: string;
  labels?: string[];
  url?: string;
  __mock?: boolean;
}

interface TodoistError extends Error {
  status?: number;
}

async function todoistFetch(path: string, init: RequestInit = {}): Promise<any> {
  const token = getToken();
  if (!token) {
    throw Object.assign(new Error("TODOIST_API_TOKEN not configured"), { status: 401 }) as TodoistError;
  }
  const res = await fetch(`${TODOIST_API_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    const err = new Error(`Todoist API ${res.status}: ${body || res.statusText}`) as TodoistError;
    err.status = res.status;
    throw err;
  }
  if (res.status === 204) return null;
  return res.json();
}

// ---------- Mock helpers (used only when no token is configured) ----------

let mockIdCounter = 1;
function mockId(): string {
  return `mock-${Date.now()}-${mockIdCounter++}`;
}

// Very small stand-in for Todoist's NLP, used only in mock mode so the rest
// of the pipeline (classifyFromTodoist, routes) can be exercised locally.
// This is NOT meant to replicate Todoist's real parser — it's a fixture.
function mockParseDue(text: string): TodoistDue | null {
  const lower = text.toLowerCase();
  const recurringMatch = /\bevery day\b|\bdaily\b|\bevery (mon|tues|wednes|thurs|fri|satur|sun)day\b|\bevery week\b|\bweekdays\b|\bweekends\b/.exec(
    lower,
  );
  if (recurringMatch) {
    return {
      date: new Date().toISOString().slice(0, 10),
      string: recurringMatch[0],
      is_recurring: true,
    };
  }
  const timeMatch = /\bat (\d{1,2})(:\d{2})?\s*(am|pm)\b/.exec(lower);
  if (timeMatch) {
    const now = new Date();
    return {
      date: now.toISOString().slice(0, 10),
      datetime: now.toISOString(),
      string: timeMatch[0],
      is_recurring: false,
    };
  }
  const dateWords = /\btomorrow\b|\btoday\b|\bnext week\b|\bmonday\b|\btuesday\b|\bwednesday\b|\bthursday\b|\bfriday\b|\bsaturday\b|\bsunday\b/.exec(
    lower,
  );
  if (dateWords) {
    return {
      date: new Date().toISOString().slice(0, 10),
      string: dateWords[0],
      is_recurring: false,
    };
  }
  return null;
}

// ---------- Public API ----------

/**
 * Sends raw capture text to Todoist's Quick Add endpoint. Todoist parses
 * #Project, @label, p1-p4, and natural-language dates/times/recurrence out
 * of the text itself. `meta: true` asks for the parsed breakdown back.
 *
 * In mock mode (no TODOIST_API_TOKEN), returns a locally-fabricated
 * approximation so callers can be tested without a real account.
 */
export async function quickAddTask(text: string): Promise<TodoistTask> {
  if (!isTodoistConfigured()) {
    return {
      id: mockId(),
      content: text,
      is_completed: false,
      due: mockParseDue(text),
      priority: 1,
      __mock: true,
    };
  }
  const data = await todoistFetch("/tasks/quick", {
    method: "POST",
    body: JSON.stringify({ text, meta: true }),
  });
  // v1 quick-add returns either the task directly or { ...task, meta: {...} }
  // depending on API version; normalize to TodoistTask shape.
  return {
    id: String(data.id),
    content: data.content,
    description: data.description,
    is_completed: !!(data.is_completed ?? data.checked),
    due: data.due ?? null,
    priority: data.priority ?? 1,
    project_id: data.project_id,
    labels: data.labels,
    url: data.url,
  };
}

/** Marks a Todoist task complete (closed). No-op (logged) in mock mode. */
export async function closeTask(todoistId: string): Promise<{ ok: boolean; mock?: boolean }> {
  if (!isTodoistConfigured()) {
    console.log(`[todoist mock] would close task ${todoistId}`);
    return { ok: true, mock: true };
  }
  await todoistFetch(`/tasks/${todoistId}/close`, { method: "POST" });
  return { ok: true };
}

/** Reopens a Todoist task (used if a completion is undone in the app). */
export async function reopenTask(todoistId: string): Promise<{ ok: boolean; mock?: boolean }> {
  if (!isTodoistConfigured()) {
    console.log(`[todoist mock] would reopen task ${todoistId}`);
    return { ok: true, mock: true };
  }
  await todoistFetch(`/tasks/${todoistId}/reopen`, { method: "POST" });
  return { ok: true };
}

/** Creates a new Todoist task directly (used for push-sync of local-only tasks). */
export async function createTask(content: string, dueDate?: string | null): Promise<TodoistTask> {
  if (!isTodoistConfigured()) {
    return {
      id: mockId(),
      content,
      is_completed: false,
      due: dueDate ? { date: dueDate, string: dueDate, is_recurring: false } : null,
      priority: 1,
      __mock: true,
    };
  }
  const data = await todoistFetch("/tasks", {
    method: "POST",
    body: JSON.stringify({ content, due_date: dueDate || undefined }),
  });
  return {
    id: String(data.id),
    content: data.content,
    is_completed: false,
    due: data.due ?? null,
    priority: data.priority ?? 1,
  };
}

/** Lists active (not completed) Todoist tasks — used for pull-sync. */
export async function listActiveTasks(): Promise<TodoistTask[]> {
  if (!isTodoistConfigured()) {
    console.log("[todoist mock] listActiveTasks called with no token — returning empty list");
    return [];
  }
  const data = await todoistFetch("/tasks");
  const results = Array.isArray(data) ? data : data.results || [];
  return results.map((t: any) => ({
    id: String(t.id),
    content: t.content,
    is_completed: !!t.is_completed,
    due: t.due ?? null,
    priority: t.priority ?? 1,
    project_id: t.project_id,
    labels: t.labels,
    url: t.url,
  }));
}

/**
 * Fetches a single task by id, used during pull-sync to check whether a
 * Todoist-linked task has been completed on the Todoist side. Returns null
 * if the task no longer exists (e.g. deleted in Todoist) rather than
 * throwing, since that's an expected/recoverable state during sync.
 */
export async function getTask(todoistId: string): Promise<TodoistTask | null> {
  if (!isTodoistConfigured()) {
    console.log(`[todoist mock] getTask(${todoistId}) — no token, returning null`);
    return null;
  }
  try {
    const data = await todoistFetch(`/tasks/${todoistId}`);
    return {
      id: String(data.id),
      content: data.content,
      is_completed: !!data.is_completed,
      due: data.due ?? null,
      priority: data.priority ?? 1,
    };
  } catch (e: any) {
    if (e?.status === 404 || e?.status === 410) return null;
    throw e;
  }
}
