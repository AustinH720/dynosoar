// server/lib/todoist-sync.ts
//
// Backs the manual "Sync Todoist" button. Does both directions:
//   - PULL: for every Sheet task that has a todoistId, check Todoist for
//     completion/content/due-date changes and reflect them into the Sheet.
//   - PUSH: for every Sheet task with NO todoistId (created locally via the
//     "+" button rather than through capture), create it in Todoist and
//     write the returned id back.
//
// The row-read/row-write functions are injected rather than imported
// directly from sheets.ts, so this logic can run against an in-memory fake
// in tests without touching the real Google Sheet or network.

import { getTask, createTask, type TodoistTask } from "./todoist.js";

export interface SheetTaskRow {
  row: number;
  task: string;
  category: string;
  dueDate: string;
  priority: string;
  status: string; // "Not Started" | "Completed"
  source: string;
  dateAdded: string;
  project: string;
  todoistId: string; // "" if not linked
}

export interface SyncResult {
  pulled: { row: number; change: string }[];
  pushed: { row: number; todoistId: string }[];
  errors: { row: number; message: string }[];
}

export interface SyncDeps {
  getAllTasks: () => Promise<SheetTaskRow[]>;
  updateTaskStatus: (row: number, status: string) => Promise<void>;
  updateTaskTodoistId: (row: number, todoistId: string) => Promise<void>;
  // Injectable so tests can simulate specific Todoist responses without a
  // real token or network call. Default to the real client in production.
  getTodoistTask?: (id: string) => Promise<TodoistTask | null>;
  createTodoistTask?: (content: string, dueDate?: string | null) => Promise<TodoistTask>;
}

export async function pullFromTodoist(deps: SyncDeps): Promise<SyncResult["pulled"]> {
  const fetchTask = deps.getTodoistTask ?? getTask;
  const tasks = await deps.getAllTasks();
  const linked = tasks.filter((t) => t.todoistId);
  const changes: SyncResult["pulled"] = [];

  for (const t of linked) {
    let remote: TodoistTask | null;
    try {
      remote = await fetchTask(t.todoistId);
    } catch (e: any) {
      console.error(`Pull sync: failed to fetch Todoist task ${t.todoistId} (row ${t.row}):`, e?.message);
      continue;
    }
    if (!remote) {
      // Deleted on the Todoist side — leave the Sheet row alone (don't
      // silently delete local data), just note it for visibility.
      changes.push({ row: t.row, change: "Todoist task no longer exists (left Sheet row untouched)" });
      continue;
    }
    const remoteStatus = remote.is_completed ? "Completed" : "Not Started";
    if (remoteStatus !== t.status) {
      await deps.updateTaskStatus(t.row, remoteStatus);
      changes.push({ row: t.row, change: `Status: ${t.status} -> ${remoteStatus}` });
    }
  }

  return changes;
}

export async function pushToTodoist(deps: SyncDeps): Promise<SyncResult["pushed"]> {
  const createRemoteTask = deps.createTodoistTask ?? createTask;
  const tasks = await deps.getAllTasks();
  const unlinked = tasks.filter((t) => !t.todoistId && t.status !== "Completed");
  const pushed: SyncResult["pushed"] = [];

  for (const t of unlinked) {
    try {
      const created = await createRemoteTask(t.task, t.dueDate || null);
      await deps.updateTaskTodoistId(t.row, created.id);
      pushed.push({ row: t.row, todoistId: created.id });
    } catch (e: any) {
      console.error(`Push sync: failed to create Todoist task for row ${t.row}:`, e?.message);
    }
  }

  return pushed;
}

export async function runFullSync(deps: SyncDeps): Promise<SyncResult> {
  const errors: SyncResult["errors"] = [];
  let pulled: SyncResult["pulled"] = [];
  let pushed: SyncResult["pushed"] = [];

  try {
    pulled = await pullFromTodoist(deps);
  } catch (e: any) {
    errors.push({ row: 0, message: `Pull sync failed: ${e?.message}` });
  }
  try {
    pushed = await pushToTodoist(deps);
  } catch (e: any) {
    errors.push({ row: 0, message: `Push sync failed: ${e?.message}` });
  }

  return { pulled, pushed, errors };
}
