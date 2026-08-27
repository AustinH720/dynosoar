import type { Express } from "express";
import type { Server } from "node:http";
import { getValues, appendRow, updateRow, clearRange, TABS, getSettings, updateSettings, normalizeTime } from "./lib/sheets.js";
import { createCalendarEvent, updateCalendarEvent, deleteCalendarEvent } from "./lib/external.js";
import { classify, extractProject } from "./lib/classify.js";
import { toIsoWithTz, todayStr, todayWeekday, nowInAppTz } from "./lib/time.js";
import { findRecentDuplicate } from "./lib/dedupe.js";
import {
  awardXp,
  getPlayerState,
  findBestTaskMatch,
  isCompletionPhrase,
  isCancellationPhrase,
  findBestEventMatch,
  type OpenEvent,
  getRoutineItems,
  toggleRoutineComplete,
  createRoutineItem,
  updateRoutineItem,
  deleteRoutineItem,
  daysSetToLabel,
  getShopItems,
  purchaseShopItem,
  type OpenTask,
} from "./lib/gamification.js";

function rowsToObjects(values: string[][], startRow: number) {
  return values.map((row, i) => ({ row: startRow + i, cells: row }));
}

function dayViewLink(dateStr: string) {
  const [y, m, d] = dateStr.split("-").map(Number);
  return `https://calendar.google.com/calendar/r/day/${y}/${m}/${d}`;
}

// Default slot for the lightweight calendar mirror we create for any task
// that has a due date. Deliberately placed at 8:00am (before the Daily
// Routine's default 9:00am block) so the two default times never collide.
// This is NOT a real scheduled appointment — it's a visible reminder that a
// task is due that day. The Task row in the Tasks tab stays the single
// source of truth: check it off or edit it there, not on the calendar.
const TASK_DUE_REMINDER_TIME = "08:00";
const TASK_DUE_REMINDER_DURATION_MIN = 15;

/**
 * Mirrors a due-dated task onto the calendar as a short, clearly-labeled
 * reminder block, and logs it to the Events tab so it's visible from the
 * Events page too. Best-effort: failures are swallowed so a calendar hiccup
 * never blocks the task itself from being saved.
 */
async function mirrorTaskDueDateToCalendar(taskText: string, dueDate: string, today: string): Promise<string> {
  try {
    const startIso = toIsoWithTz(dueDate, TASK_DUE_REMINDER_TIME);
    const [h, m] = TASK_DUE_REMINDER_TIME.split(":").map(Number);
    const endDate = new Date(2000, 0, 1, h, m + TASK_DUE_REMINDER_DURATION_MIN);
    const endTime = `${String(endDate.getHours()).padStart(2, "0")}:${String(endDate.getMinutes()).padStart(2, "0")}`;
    const endIso = toIsoWithTz(dueDate, endTime);
    const title = `\ud83d\udcdd Due: ${taskText}`;
    const calResult = await createCalendarEvent({
      title,
      description: `Task reminder added via DynoSOAR.\n\nThis task is due today \u2014 check it off on the Tasks page once it's done.\n\nOriginal entry: "${taskText}"`,
      start_date_time: startIso,
      end_date_time: endIso,
    });
    const eventLink = calResult.eventId ? dayViewLink(dueDate) : "";
    await appendRow(TABS.EVENTS, [
      title,
      dueDate,
      TASK_DUE_REMINDER_TIME,
      endTime,
      "",
      eventLink,
      "Task due-date reminder",
      today,
      calResult.eventId ?? "",
    ]);
    return eventLink;
  } catch (e: any) {
    console.error("Task due-date calendar mirror failed:", e?.message);
    return "";
  }
}

export async function registerRoutes(
  httpServer: Server,
  app: Express,
): Promise<Server> {
  // ---------- Capture ----------
  app.post("/api/capture", async (req, res) => {
    try {
      const text = (req.body?.text ?? "").toString().trim();
      if (!text) {
        return res.status(400).json({ message: "Entry text is required" });
      }

      const now = nowInAppTz();
      const today = todayStr();
      const timestamp = new Date().toISOString();

      // ---- Completion detection: "completed the CFA practice set", "done with laundry" ----
      if (isCompletionPhrase(text)) {
        const taskValues = await getValues(TABS.TASKS, "A2:H2000");
        const openTasks: (OpenTask & { category?: string; project?: string })[] = rowsToObjects(taskValues, 2)
          .filter((r) => r.cells[0])
          .map((r) => ({
            row: r.row,
            task: r.cells[0] ?? "",
            status: r.cells[4] ?? "Not Started",
            category: r.cells[1] ?? "",
            project: r.cells[7] ?? "",
          }));
        const match = findBestTaskMatch(text, openTasks);

        let summary: string;
        let xpResult;
        if (match) {
          await updateRow(TABS.TASKS, `E${match.row}`, ["Completed"]);
          const matchedTask = openTasks.find((t) => t.row === match.row);
          xpResult = await awardXp(
            "task_completed",
            `Completed via Home: "${match.task}"`,
            matchedTask?.category ?? "",
            matchedTask?.project ?? "",
          );
          summary = `Marked "${match.task}" as completed`;
        } else {
          xpResult = await awardXp("freeform_completion", text);
          summary = "Logged as completed";
        }

        await appendRow(TABS.INBOX, [
          timestamp,
          text,
          "Completion",
          "Processed",
          new Date().toISOString(),
          `App capture: ${summary} (+${xpResult.xpAwarded} XP)`,
        ]);

        return res.json({
          ok: true,
          type: "Completion",
          summary,
          matchedTask: match?.task ?? null,
          xp: xpResult,
        });
      }

      // ---- Cancellation detection: "cancel my call mortgage broker renewal", "remove the dentist appointment" ----
      if (isCancellationPhrase(text)) {
        const eventValues = await getValues(TABS.EVENTS, "A2:I2000");
        const openEvents: OpenEvent[] = rowsToObjects(eventValues, 2)
          .filter((r) => r.cells[0])
          .map((r) => ({
            row: r.row,
            title: r.cells[0] ?? "",
            date: r.cells[1] ?? "",
            eventId: r.cells[8] ?? "",
          }))
          .filter((e) => !e.date || e.date >= today); // ignore past events so a stale namesake never wins
        const match = findBestEventMatch(text, openEvents);

        let summary: string;
        if (match) {
          await clearRange(TABS.EVENTS, `A${match.row}:I${match.row}`);
          if (match.eventId) {
            try {
              await deleteCalendarEvent(match.eventId);
            } catch (e: any) {
              console.error("Calendar delete failed:", e?.message);
            }
          }
          summary = match.eventId
            ? `Cancelled "${match.title}" and removed it from your calendar`
            : `Cancelled "${match.title}" (no calendar sync available for this older event, but it's removed from Events)`;
        } else {
          summary = "Couldn't find a matching upcoming event to cancel — nothing was changed";
        }

        await appendRow(TABS.INBOX, [
          timestamp,
          text,
          "Cancellation",
          "Processed",
          new Date().toISOString(),
          `App capture: ${summary}`,
        ]);

        return res.json({
          ok: true,
          type: "Cancellation",
          summary,
          matchedEvent: match?.title ?? null,
        });
      }

      const { project, rest } = extractProject(text);
      const c = classify(rest, now);

      // A project-tagged entry with no clear date/action defaults to a Task
      // (e.g. "Fish: water change" reads as a Note otherwise).
      if (project && c.type === "Note") {
        c.type = "Task";
        c.dueDate = c.dueDate ?? null;
        c.priority = c.priority ?? "Medium";
        c.category = c.category ?? "General";
      }

      const force = req.body?.force === true;
      if (!force && (c.type === "Task" || c.type === "Note")) {
        const dup = await findRecentDuplicate(project ? rest : text, c.type);
        if (dup) {
          return res.json({
            ok: true,
            duplicate: true,
            type: c.type,
            match: dup,
          });
        }
      }

      let summary = "";
      let detail: Record<string, any> = { type: c.type };

      if (c.type === "Event") {
        const startIso = toIsoWithTz(c.eventDate!, c.startTime!);
        const endIso = toIsoWithTz(c.eventDate!, c.endTime!);
        let eventLink = "";
        let capturedEventId = "";
        try {
          const calResult = await createCalendarEvent({
            title: text,
            description: `Added via DynoSOAR.\n\nOriginal entry: "${text}"`,
            start_date_time: startIso,
            end_date_time: endIso,
            location: c.location ?? null,
          });
          eventLink = calResult.eventId ? dayViewLink(c.eventDate!) : "";
          capturedEventId = calResult.eventId ?? "";
        } catch (e: any) {
          console.error("Calendar create failed:", e?.message);
          eventLink = "";
        }
        await appendRow(TABS.EVENTS, [
          text,
          c.eventDate,
          c.startTime,
          c.endTime,
          c.location ?? "",
          eventLink,
          "App capture",
          today,
          capturedEventId,
        ]);
        summary = `Event scheduled for ${c.eventDate} at ${c.startTime}`;
        detail = { ...detail, date: c.eventDate, startTime: c.startTime, endTime: c.endTime, eventLink };
      } else if (c.type === "Task") {
        const taskText = project ? rest : text;
        await appendRow(TABS.TASKS, [
          taskText,
          c.category,
          c.dueDate ?? "",
          c.priority,
          "Not Started",
          "App capture",
          today,
          project ?? "",
        ]);
        let calendarLink = "";
        if (c.dueDate) {
          calendarLink = await mirrorTaskDueDateToCalendar(taskText, c.dueDate, today);
        }
        summary = c.dueDate
          ? `Task added, due ${c.dueDate} (${c.priority} priority)${calendarLink ? " \u2014 also added to your calendar" : ""}`
          : `Task added (${c.priority} priority)`;
        detail = { ...detail, dueDate: c.dueDate, priority: c.priority, category: c.category, project, calendarLink };
      } else if (c.type === "Recurring") {
        let eventLink = "";
        if (c.eventDate && c.startTime && c.endTime) {
          const startIso = toIsoWithTz(c.eventDate, c.startTime);
          const endIso = toIsoWithTz(c.eventDate, c.endTime);
          try {
            const calResult = await createCalendarEvent({
              title: text,
              description: `Recurring entry added via DynoSOAR (${c.cadenceLabel}).\n\nOriginal entry: "${text}"`,
              start_date_time: startIso,
              end_date_time: endIso,
              recurrence: c.rrule ? [c.rrule] : null,
            });
            eventLink = calResult.eventId ? dayViewLink(c.eventDate) : "";
          } catch (e) {
            eventLink = "";
          }
        }
        // Daily Routine tab columns: Time Block | Activity | Days | Type | Auto-add to Calendar? | Notes | Last Completed
        await appendRow(TABS.ROUTINE, [
          c.startTime ?? "",
          text,
          c.cadenceLabel ?? "",
          c.category,
          eventLink ? "Yes (recurring event)" : "No",
          eventLink ? `App capture — ${eventLink}` : "App capture",
          "",
        ]);
        // Also surface it on the Tasks list, grouped under a dedicated
        // "Recurring" project so it's visible without hunting through the
        // routine checklist. Due date is the next occurrence; the calendar
        // series itself repeats independently.
        await appendRow(TABS.TASKS, [
          text,
          c.category,
          c.eventDate ?? "",
          "Medium",
          "Not Started",
          "App capture (recurring)",
          today,
          "🔁 Recurring",
        ]);
        summary = eventLink
          ? `Recurring — added to Tasks (due ${c.eventDate}) and scheduled on calendar (${c.cadenceLabel})`
          : `Recurring — added to Tasks (due ${c.eventDate}); calendar scheduling failed`;
        detail = { ...detail, cadenceLabel: c.cadenceLabel, dueDate: c.eventDate, eventLink };
      } else {
        await appendRow(TABS.NOTES, [today, project ? rest : text, c.category ?? "", "", project ?? "", ""]);
        summary = "Saved as a note";
        detail = { ...detail, category: c.category, project };
      }

      const XP_SOURCE_BY_TYPE = {
        Event: "event_added",
        Task: "task_added",
        Recurring: "recurring_added",
        Note: "note_added",
      } as const;
      const xpResult = await awardXp(XP_SOURCE_BY_TYPE[c.type], text, c.category ?? "");

      await appendRow(TABS.INBOX, [
        timestamp,
        text,
        c.type,
        "Processed",
        new Date().toISOString(),
        `App capture: ${summary} (+${xpResult.xpAwarded} XP)`,
      ]);

      res.json({ ok: true, summary, ...detail, xp: xpResult });
    } catch (err: any) {
      console.error("Capture error:", err);
      res.status(500).json({ message: err.message || "Failed to process entry" });
    }
  });

  // ---------- Tasks ----------
  app.get("/api/tasks", async (_req, res) => {
    try {
      const values = await getValues(TABS.TASKS, "A2:H2000");
      const tasks = rowsToObjects(values, 2)
        .filter((r) => r.cells[0])
        .map((r) => ({
          row: r.row,
          task: r.cells[0] ?? "",
          category: r.cells[1] ?? "",
          dueDate: r.cells[2] ?? "",
          priority: r.cells[3] ?? "Medium",
          status: r.cells[4] ?? "Not Started",
          source: r.cells[5] ?? "",
          dateAdded: r.cells[6] ?? "",
          project: r.cells[7] ?? "",
        }));
      res.json(tasks);
    } catch (err: any) {
      console.error("Tasks fetch error:", err);
      res.status(500).json({ message: err.message || "Failed to load tasks" });
    }
  });

  app.post("/api/tasks", async (req, res) => {
    try {
      const task = (req.body?.task ?? "").toString().trim();
      const project = (req.body?.project ?? "").toString().trim();
      const dueDate = (req.body?.dueDate ?? "").toString().trim();
      const priority = req.body?.priority === "High" ? "High" : "Medium";
      const explicitCategory = (req.body?.category ?? "").toString().trim();
      const category = explicitCategory || project || "General";
      if (!task) {
        return res.status(400).json({ message: "task is required" });
      }
      const today = todayStr();
      await appendRow(TABS.TASKS, [task, category, dueDate, priority, "Not Started", "App capture", today, project]);
      const calendarLink = dueDate ? await mirrorTaskDueDateToCalendar(task, dueDate, today) : "";
      const xpResult = await awardXp("task_added", task, category, project);
      await appendRow(TABS.INBOX, [
        new Date().toISOString(),
        project ? `${project}: ${task}` : task,
        "Task",
        "Processed",
        new Date().toISOString(),
        `App capture: Task added${project ? ` under ${project}` : ""} (+${xpResult.xpAwarded} XP)`,
      ]);
      res.json({ ok: true, xp: xpResult, calendarLink });
    } catch (err: any) {
      console.error("Task create error:", err);
      res.status(500).json({ message: err.message || "Failed to create task" });
    }
  });

  app.patch("/api/tasks/:row", async (req, res) => {
    try {
      const row = Number(req.params.row);
      if (!row) {
        return res.status(400).json({ message: "row is required" });
      }

      const body = req.body ?? {};
      const hasField = (key: string) => Object.prototype.hasOwnProperty.call(body, key);
      const status = hasField("status") ? (body.status ?? "").toString() : undefined;

      if (!hasField("task") && !hasField("category") && !hasField("dueDate") && !hasField("priority") && !status) {
        return res.status(400).json({ message: "no fields to update" });
      }

      const prevValues = await getValues(TABS.TASKS, `A${row}:H${row}`);
      const prev = prevValues[0] ?? [];
      const taskText = hasField("task") ? (body.task ?? "").toString().trim() || prev[0] || "" : prev[0] ?? "";
      const taskCategory = hasField("category")
        ? (body.category ?? "").toString().trim() || "General"
        : prev[1] ?? "";
      const dueDate = hasField("dueDate") ? (body.dueDate ?? "").toString().trim() : prev[2] ?? "";
      const priority = hasField("priority")
        ? body.priority === "High"
          ? "High"
          : "Medium"
        : prev[3] ?? "Medium";
      const nextStatus = status || prev[4] || "Not Started";
      const taskProject = prev[7] ?? "";

      await updateRow(TABS.TASKS, `A${row}:E${row}`, [taskText, taskCategory, dueDate, priority, nextStatus]);

      let xpResult: Awaited<ReturnType<typeof awardXp>> | null = null;
      if (nextStatus === "Completed" && prev[4] !== "Completed") {
        xpResult = await awardXp("task_completed", taskText || `Task row ${row}`, taskCategory, taskProject);
      }

      res.json({ ok: true, xp: xpResult });
    } catch (err: any) {
      console.error("Task update error:", err);
      res.status(500).json({ message: err.message || "Failed to update task" });
    }
  });

  // ---------- Events ----------
  app.get("/api/events", async (_req, res) => {
    try {
      const values = await getValues(TABS.EVENTS, "A2:I2000");
      const events = rowsToObjects(values, 2)
        .filter((r) => r.cells[0])
        .map((r) => ({
          row: r.row,
          title: r.cells[0] ?? "",
          date: r.cells[1] ?? "",
          startTime: normalizeTime(r.cells[2]),
          endTime: normalizeTime(r.cells[3]),
          location: r.cells[4] ?? "",
          eventLink: r.cells[5] ?? "",
          source: r.cells[6] ?? "",
          dateAdded: r.cells[7] ?? "",
          hasCalendarSync: Boolean(r.cells[8]),
        }));
      res.json(events);
    } catch (err: any) {
      console.error("Events fetch error:", err);
      res.status(500).json({ message: err.message || "Failed to load events" });
    }
  });

  app.patch("/api/events/:row", async (req, res) => {
    try {
      const row = Number(req.params.row);
      if (!row) {
        return res.status(400).json({ message: "row is required" });
      }
      const existing = await getValues(TABS.EVENTS, `A${row}:I${row}`);
      const prev = existing[0] ?? [];
      const body = req.body ?? {};
      const title = body.title != null ? String(body.title).trim() : prev[0] ?? "";
      const date = body.date != null ? String(body.date) : prev[1] ?? "";
      const startTime = normalizeTime(body.startTime != null ? String(body.startTime) : prev[2] ?? "");
      const endTime = normalizeTime(body.endTime != null ? String(body.endTime) : prev[3] ?? "");
      const location = body.location != null ? String(body.location) : prev[4] ?? "";
      const eventLink = prev[5] ?? "";
      const source = prev[6] ?? "";
      const dateAdded = prev[7] ?? "";
      const eventId = prev[8] ?? "";

      if (eventId) {
        try {
          await updateCalendarEvent({
            eventId,
            title,
            start_date_time: date && startTime ? toIsoWithTz(date, startTime) : null,
            end_date_time: date && endTime ? toIsoWithTz(date, endTime) : null,
            location: location || null,
          });
        } catch (e: any) {
          console.error("Calendar update failed:", e?.message);
        }
      }

      await updateRow(TABS.EVENTS, `A${row}:I${row}`, [
        title,
        date,
        startTime,
        endTime,
        location,
        eventLink,
        source,
        dateAdded,
        eventId,
      ]);
      res.json({ ok: true, syncedToCalendar: Boolean(eventId) });
    } catch (err: any) {
      console.error("Event update error:", err);
      res.status(500).json({ message: err.message || "Failed to update event" });
    }
  });

  app.delete("/api/events/:row", async (req, res) => {
    try {
      const row = Number(req.params.row);
      if (!row) {
        return res.status(400).json({ message: "row is required" });
      }
      const existing = await getValues(TABS.EVENTS, `A${row}:I${row}`);
      const eventId = existing[0]?.[8] ?? "";
      if (eventId) {
        try {
          await deleteCalendarEvent(eventId);
        } catch (e: any) {
          console.error("Calendar delete failed:", e?.message);
        }
      }
      await clearRange(TABS.EVENTS, `A${row}:I${row}`);
      res.json({ ok: true, syncedToCalendar: Boolean(eventId) });
    } catch (err: any) {
      console.error("Event delete error:", err);
      res.status(500).json({ message: err.message || "Failed to delete event" });
    }
  });

  // ---------- Notes ----------
  app.get("/api/notes", async (_req, res) => {
    try {
      const values = await getValues(TABS.NOTES, "A2:F2000");
      const notes = rowsToObjects(values, 2)
        .filter((r) => r.cells[1])
        .map((r) => ({
          row: r.row,
          date: r.cells[0] ?? "",
          entry: r.cells[1] ?? "",
          tags: r.cells[2] ?? "",
          linked: r.cells[3] ?? "",
          project: r.cells[4] ?? "",
          details: r.cells[5] ?? "",
        }))
        .reverse();
      res.json(notes);
    } catch (err: any) {
      console.error("Notes fetch error:", err);
      res.status(500).json({ message: err.message || "Failed to load notes" });
    }
  });

  app.post("/api/notes", async (req, res) => {
    try {
      const entry = (req.body?.entry ?? "").toString().trim();
      const project = (req.body?.project ?? "").toString().trim();
      const tags = (req.body?.tags ?? "").toString().trim();
      const details = (req.body?.details ?? "").toString().trim();
      if (!entry) {
        return res.status(400).json({ message: "entry is required" });
      }
      const today = todayStr();
      await appendRow(TABS.NOTES, [today, entry, tags, "", project, details]);
      const xpResult = await awardXp("note_added", entry, tags);
      await appendRow(TABS.INBOX, [
        new Date().toISOString(),
        project ? `${project}: ${entry}` : entry,
        "Note",
        "Processed",
        new Date().toISOString(),
        `App capture: Saved as a note${project ? ` under ${project}` : ""} (+${xpResult.xpAwarded} XP)`,
      ]);
      res.json({ ok: true, xp: xpResult });
    } catch (err: any) {
      console.error("Note create error:", err);
      res.status(500).json({ message: err.message || "Failed to create note" });
    }
  });

  app.patch("/api/notes/:row", async (req, res) => {
    try {
      const row = Number(req.params.row);
      if (!row) {
        return res.status(400).json({ message: "row is required" });
      }
      const existing = await getValues(TABS.NOTES, `A${row}:F${row}`);
      const current = existing[0] ?? ["", "", "", "", "", ""];
      const date = current[0] ?? todayStr();
      const linked = current[3] ?? "";
      const entry =
        req.body?.entry !== undefined ? req.body.entry.toString().trim() : current[1] ?? "";
      const tags =
        req.body?.tags !== undefined ? req.body.tags.toString().trim() : current[2] ?? "";
      const project =
        req.body?.project !== undefined ? req.body.project.toString().trim() : current[4] ?? "";
      const details =
        req.body?.details !== undefined ? req.body.details.toString() : current[5] ?? "";
      if (!entry) {
        return res.status(400).json({ message: "entry is required" });
      }
      await updateRow(TABS.NOTES, `A${row}:F${row}`, [date, entry, tags, linked, project, details]);
      res.json({ ok: true });
    } catch (err: any) {
      console.error("Note update error:", err);
      res.status(500).json({ message: err.message || "Failed to update note" });
    }
  });

  app.delete("/api/notes/:row", async (req, res) => {
    try {
      const row = Number(req.params.row);
      if (!row) {
        return res.status(400).json({ message: "row is required" });
      }
      await clearRange(TABS.NOTES, `A${row}:F${row}`);
      res.json({ ok: true });
    } catch (err: any) {
      console.error("Note delete error:", err);
      res.status(500).json({ message: err.message || "Failed to delete note" });
    }
  });

  // ---------- Settings ----------
  app.get("/api/settings", async (_req, res) => {
    try {
      const settings = await getSettings();
      res.json(settings);
    } catch (err: any) {
      console.error("Settings fetch error:", err);
      res.status(500).json({ message: err.message || "Failed to load settings" });
    }
  });

  app.patch("/api/settings", async (req, res) => {
    try {
      const patch: Record<string, string> = {};
      if (typeof req.body?.themeMode === "string") patch.themeMode = req.body.themeMode;
      if (typeof req.body?.accentColor === "string") patch.accentColor = req.body.accentColor;
      if (typeof req.body?.backgroundScene === "string") patch.backgroundScene = req.body.backgroundScene;
      const settings = await updateSettings(patch as any);
      res.json(settings);
    } catch (err: any) {
      console.error("Settings update error:", err);
      res.status(500).json({ message: err.message || "Failed to update settings" });
    }
  });

  // ---------- Recurring routine checklist ----------
  // /api/routine (singular) is the Home screen's "Today's Routine" widget —
  // filtered to items actually scheduled for today's weekday.
  app.get("/api/routine", async (_req, res) => {
    try {
      const items = await getRoutineItems(todayStr(), todayWeekday());
      res.json(items.filter((i) => i.scheduledToday));
    } catch (err: any) {
      console.error("Routine fetch error:", err);
      res.status(500).json({ message: err.message || "Failed to load routine" });
    }
  });

  app.post("/api/routine/:row/complete", async (req, res) => {
    try {
      const row = Number(req.params.row);
      const activity = (req.body?.activity ?? "").toString();
      if (!row) {
        return res.status(400).json({ message: "row is required" });
      }
      const result = await toggleRoutineComplete(row, activity || `Routine row ${row}`, todayStr());
      res.json({ ok: true, ...result });
    } catch (err: any) {
      console.error("Routine toggle error:", err);
      res.status(500).json({ message: err.message || "Failed to update routine" });
    }
  });

  // /api/routines (plural) is the full management list for the Routine tab —
  // every item regardless of which day it's scheduled for.
  app.get("/api/routines", async (_req, res) => {
    try {
      const items = await getRoutineItems(todayStr(), todayWeekday());
      res.json(items);
    } catch (err: any) {
      console.error("Routines fetch error:", err);
      res.status(500).json({ message: err.message || "Failed to load routines" });
    }
  });

  app.post("/api/routines", async (req, res) => {
    try {
      const activity = (req.body?.activity ?? "").toString().trim();
      if (!activity) {
        return res.status(400).json({ message: "activity is required" });
      }
      const dayIndices: number[] = Array.isArray(req.body?.dayIndices) ? req.body.dayIndices.map(Number) : [];
      const days = dayIndices.length > 0 ? daysSetToLabel(dayIndices) : "Daily";
      await createRoutineItem({
        timeBlock: (req.body?.timeBlock ?? "").toString(),
        activity,
        days,
        category: (req.body?.category ?? "").toString().trim() || "General",
        notes: (req.body?.notes ?? "").toString(),
      });
      res.json({ ok: true });
    } catch (err: any) {
      console.error("Routine create error:", err);
      res.status(500).json({ message: err.message || "Failed to create routine" });
    }
  });

  app.patch("/api/routines/:row", async (req, res) => {
    try {
      const row = Number(req.params.row);
      if (!row) {
        return res.status(400).json({ message: "row is required" });
      }
      const body = req.body ?? {};
      const hasField = (key: string) => Object.prototype.hasOwnProperty.call(body, key);
      const days = Array.isArray(body.dayIndices) ? daysSetToLabel(body.dayIndices.map(Number)) : undefined;
      await updateRoutineItem(row, {
        timeBlock: hasField("timeBlock") ? (body.timeBlock ?? "").toString() : undefined,
        activity: hasField("activity") ? (body.activity ?? "").toString().trim() : undefined,
        days,
        category: hasField("category") ? (body.category ?? "").toString().trim() || "General" : undefined,
        notes: hasField("notes") ? (body.notes ?? "").toString() : undefined,
      });
      res.json({ ok: true });
    } catch (err: any) {
      console.error("Routine update error:", err);
      res.status(500).json({ message: err.message || "Failed to update routine" });
    }
  });

  app.delete("/api/routines/:row", async (req, res) => {
    try {
      const row = Number(req.params.row);
      if (!row) {
        return res.status(400).json({ message: "row is required" });
      }
      await deleteRoutineItem(row);
      res.json({ ok: true });
    } catch (err: any) {
      console.error("Routine delete error:", err);
      res.status(500).json({ message: err.message || "Failed to delete routine" });
    }
  });

  // ---------- Player / gamification ----------
  app.get("/api/player", async (_req, res) => {
    try {
      const player = await getPlayerState();
      res.json(player);
    } catch (err: any) {
      console.error("Player fetch error:", err);
      res.status(500).json({ message: err.message || "Failed to load player state" });
    }
  });

  app.get("/api/skills", async (_req, res) => {
    try {
      const player = await getPlayerState();
      res.json({ coins: player.coins, skills: player.skills, hunger: player.hunger });
    } catch (err: any) {
      console.error("Skills fetch error:", err);
      res.status(500).json({ message: err.message || "Failed to load skills" });
    }
  });

  // ---------- Shop ----------
  app.get("/api/shop", async (_req, res) => {
    try {
      const shop = await getShopItems();
      res.json(shop);
    } catch (err: any) {
      console.error("Shop fetch error:", err);
      res.status(500).json({ message: err.message || "Failed to load shop" });
    }
  });

  app.post("/api/shop/:row/purchase", async (req, res) => {
    try {
      const row = Number(req.params.row);
      if (!row) {
        return res.status(400).json({ message: "row is required" });
      }
      const result = await purchaseShopItem(row);
      if (!result.ok) {
        return res.status(400).json({ message: result.message });
      }
      res.json(result);
    } catch (err: any) {
      console.error("Shop purchase error:", err);
      res.status(500).json({ message: err.message || "Failed to purchase item" });
    }
  });

  // ---------- Today snapshot ----------
  app.get("/api/today", async (_req, res) => {
    try {
      const today = todayStr();
      const [taskValues, eventValues] = await Promise.all([
        getValues(TABS.TASKS, "A2:G2000"),
        getValues(TABS.EVENTS, "A2:H2000"),
      ]);

      const tasksDueOrOverdue = rowsToObjects(taskValues, 2)
        .filter((r) => r.cells[0])
        .map((r) => ({
          row: r.row,
          task: r.cells[0] ?? "",
          category: r.cells[1] ?? "",
          dueDate: r.cells[2] ?? "",
          priority: r.cells[3] ?? "Medium",
          status: r.cells[4] ?? "Not Started",
        }))
        .filter(
          (t) =>
            t.status !== "Completed" &&
            t.dueDate &&
            t.dueDate <= today,
        );

      const eventsToday = rowsToObjects(eventValues, 2)
        .filter((r) => r.cells[0])
        .map((r) => ({
          row: r.row,
          title: r.cells[0] ?? "",
          date: r.cells[1] ?? "",
          startTime: normalizeTime(r.cells[2]),
          endTime: normalizeTime(r.cells[3]),
          location: r.cells[4] ?? "",
        }))
        .filter((e) => e.date === today)
        .sort((a, b) => a.startTime.localeCompare(b.startTime));

      res.json({ today, events: eventsToday, tasks: tasksDueOrOverdue });
    } catch (err: any) {
      console.error("Today fetch error:", err);
      res.status(500).json({ message: err.message || "Failed to load today view" });
    }
  });

  return httpServer;
}
