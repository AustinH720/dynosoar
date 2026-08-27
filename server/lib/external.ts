import { execFile } from "node:child_process";
import { getCalendarClient } from "./google-auth.js";

// Two auth paths, same rationale as sheets.ts: service account (production)
// when GOOGLE_SERVICE_ACCOUNT_KEY is set, gws/external-tool CLI (this sandbox
// during development) otherwise.
const useServiceAccount = !!process.env.GOOGLE_SERVICE_ACCOUNT_KEY;

// The calendar the service account writes to. Defaults to "primary", which
// only works if the calendar owner's "primary" calendar was shared with the
// service account. For a secondary/named calendar, share that calendar's ID
// (Settings -> Integrate calendar -> Calendar ID) with the service account
// instead, and set GOOGLE_CALENDAR_ID to it as an environment variable.
const CALENDAR_ID = process.env.GOOGLE_CALENDAR_ID || "primary";

export function callExternalTool(
  sourceId: string,
  toolName: string,
  args: object,
): Promise<any> {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({
      source_id: sourceId,
      tool_name: toolName,
      arguments: args,
    });
    // The gws (Google Workspace) credential preset sets HTTPS_PROXY to a
    // proxy URL embedding ITS OWN token. If that var leaks into this call,
    // the external-tool CLI's underlying HTTP client picks it up and routes
    // through the wrong tunnel, causing a 403 at the proxy. external-tool
    // auths via PPLX_AGENT_PROXY_TOKEN/URL instead, so strip proxy vars here.
    const env = { ...process.env };
    delete env.HTTPS_PROXY;
    delete env.HTTP_PROXY;
    delete env.https_proxy;
    delete env.http_proxy;
    execFile(
      "external-tool",
      ["call", payload],
      { maxBuffer: 1024 * 1024 * 20, env },
      (err, stdout, stderr) => {
        if (err) {
          reject(new Error(stderr?.toString() || err.message));
          return;
        }
        try {
          resolve(stdout ? JSON.parse(stdout.toString()) : {});
        } catch (e) {
          reject(new Error(`Failed to parse external-tool output: ${stdout}`));
        }
      },
    );
  });
}

async function createCalendarEventServiceAccount(opts: {
  title: string;
  description: string;
  start_date_time: string;
  end_date_time: string;
  location?: string | null;
  recurrence?: string[] | null;
}): Promise<{ eventId: string | null; raw: any }> {
  const calendar = getCalendarClient();
  const res = await calendar.events.insert({
    calendarId: CALENDAR_ID,
    requestBody: {
      summary: opts.title,
      description: opts.description,
      location: opts.location ?? undefined,
      start: { dateTime: opts.start_date_time },
      end: { dateTime: opts.end_date_time },
      recurrence: opts.recurrence ?? undefined,
    },
  });
  return { eventId: res.data.id ?? null, raw: res.data };
}

async function createCalendarEventGws(opts: {
  title: string;
  description: string;
  start_date_time: string;
  end_date_time: string;
  location?: string | null;
  recurrence?: string[] | null;
}): Promise<{ eventId: string | null; raw: any }> {
  const result = await callExternalTool("gcal", "update_calendar", {
    create_actions: [
      {
        action: "create",
        title: opts.title,
        description: opts.description,
        start_date_time: opts.start_date_time,
        end_date_time: opts.end_date_time,
        location: opts.location ?? null,
        recurrence: opts.recurrence ?? null,
        attendees: [],
        optional_attendees: null,
        meeting_provider: null,
        calendar_color: null,
        connection_id: null,
      },
    ],
    delete_actions: [],
    update_actions: [],
    user_prompt: null,
  });
  const eventId =
    result?.results?.[0]?.calendar_actions?.[0]?.event_id ??
    result?.result?.[0]?.calendar_actions?.[0]?.event_id ??
    null;
  return { eventId, raw: result };
}

export async function createCalendarEvent(opts: {
  title: string;
  description: string;
  start_date_time: string;
  end_date_time: string;
  location?: string | null;
  recurrence?: string[] | null;
}): Promise<{ eventId: string | null; raw: any }> {
  return useServiceAccount
    ? createCalendarEventServiceAccount(opts)
    : createCalendarEventGws(opts);
}

export interface UpdateCalendarOpts {
  eventId: string;
  title?: string | null;
  description?: string | null;
  start_date_time?: string | null;
  end_date_time?: string | null;
  location?: string | null;
}

async function updateCalendarEventServiceAccount(opts: UpdateCalendarOpts): Promise<void> {
  const calendar = getCalendarClient();
  const requestBody: Record<string, any> = {};
  if (opts.title != null) requestBody.summary = opts.title;
  if (opts.description != null) requestBody.description = opts.description;
  if (opts.location != null) requestBody.location = opts.location;
  if (opts.start_date_time != null) requestBody.start = { dateTime: opts.start_date_time };
  if (opts.end_date_time != null) requestBody.end = { dateTime: opts.end_date_time };
  await calendar.events.patch({
    calendarId: CALENDAR_ID,
    eventId: opts.eventId,
    requestBody,
  });
}

async function updateCalendarEventGws(opts: UpdateCalendarOpts): Promise<void> {
  await callExternalTool("gcal", "update_calendar", {
    create_actions: [],
    delete_actions: [],
    update_actions: [
      {
        action: "update",
        event_id: opts.eventId,
        title: opts.title ?? null,
        description: opts.description ?? null,
        start_date_time: opts.start_date_time ?? null,
        end_date_time: opts.end_date_time ?? null,
        location: opts.location ?? null,
        meeting_provider: null,
        attendees: null,
        optional_attendees: null,
        recurrence: null,
        connection_id: null,
      },
    ],
    user_prompt: null,
  });
}

export async function updateCalendarEvent(opts: UpdateCalendarOpts): Promise<void> {
  return useServiceAccount ? updateCalendarEventServiceAccount(opts) : updateCalendarEventGws(opts);
}

async function deleteCalendarEventServiceAccount(eventId: string): Promise<void> {
  const calendar = getCalendarClient();
  await calendar.events.delete({ calendarId: CALENDAR_ID, eventId });
}

async function deleteCalendarEventGws(eventId: string): Promise<void> {
  await callExternalTool("gcal", "update_calendar", {
    create_actions: [],
    delete_actions: [{ action: "delete", event_id: eventId, delete_scope: "single", connection_id: null }],
    update_actions: [],
    user_prompt: null,
  });
}

export async function deleteCalendarEvent(eventId: string): Promise<void> {
  return useServiceAccount ? deleteCalendarEventServiceAccount(eventId) : deleteCalendarEventGws(eventId);
}
