// server/lib/focus.ts
//
// Logs completed/ended focus sessions to the "⏱️ Focus Log" Sheet tab and
// credits the computed XP (see focusXp.ts) to the player via
// gamification.ts's awardCustomXp — variable-amount XP that skips the
// fixed XP_RULES lookup awardXp() uses for other sources.

import { appendRow, TABS } from "./sheets.js";
// Relative import, not the "@shared/*" alias: that alias is resolved by Vite
// (client) and by tsx (local dev), but Vercel's serverless function builder
// for api/index.ts doesn't reliably resolve it, which crashed every /api
// route in production (this file is imported unconditionally by routes.ts).
import { computeFocusXp, type FocusXpInput } from "../../shared/focusXp.js";
import { awardCustomXp, type AwardResult } from "./gamification.js";

export interface LogFocusSessionInput extends FocusXpInput {
  taskRow?: number;
  taskText?: string;
}

export interface LogFocusSessionResult {
  xpAwarded: number;
  breakdown: ReturnType<typeof computeFocusXp>;
  xp: AwardResult;
}

export async function logFocusSession(input: LogFocusSessionInput): Promise<LogFocusSessionResult> {
  const breakdown = computeFocusXp(input);

  await appendRow(TABS.FOCUS_LOG, [
    new Date().toISOString(),
    input.durationMinutes,
    input.completed ? "Yes" : "No",
    input.taskRow ?? "",
    input.taskText ?? "",
    breakdown.totalXp,
  ]);

  const description = input.taskText
    ? `Focus session (${input.durationMinutes} min): ${input.taskText}`
    : `Focus session (${input.durationMinutes} min)`;
  const xp = await awardCustomXp(breakdown.totalXp, description);

  return { xpAwarded: breakdown.totalXp, breakdown, xp };
}
