// server/lib/focus.ts
//
// Logs completed/ended focus sessions to the "⏱️ Focus Log" Sheet tab and
// credits the computed XP (see focusXp.ts) to the player via
// gamification.ts's awardCustomXp — variable-amount XP that skips the
// fixed XP_RULES lookup awardXp() uses for other sources.

import { appendRow, TABS } from "./sheets.js";
import { computeFocusXp, type FocusXpInput } from "@shared/focusXp";
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
