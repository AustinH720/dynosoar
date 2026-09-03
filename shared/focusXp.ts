// shared/focusXp.ts — pure XP math for focus sessions, imported by both the
// server route (server/lib/focus.ts) and the client timer UI
// (client/src/components/FocusTimer.tsx) via the @shared/* alias.
//
// Kept separate from FocusTimer.tsx / the server route specifically so it's
// unit-testable in isolation: XP math is exactly the kind of logic that's
// easy to get subtly wrong (off-by-one on rounding, double-counting the
// completion bonus) and cheap to verify with a few table-driven cases.

const XP_PER_MINUTE = 2;
const COMPLETION_BONUS = 15; // awarded once, only if the session ran to completion
const TASK_LINK_BONUS = 10; // awarded once, only if a linked task was completed in-session

export interface FocusXpInput {
  durationMinutes: number;
  completed: boolean; // did the countdown reach zero naturally, vs. ended early
  linkedTaskCompletedInSession?: boolean;
}

export interface FocusXpResult {
  baseXp: number;
  completionBonus: number;
  taskLinkBonus: number;
  totalXp: number;
}

export function computeFocusXp(input: FocusXpInput): FocusXpResult {
  const minutes = Math.max(0, Math.round(input.durationMinutes));
  const baseXp = minutes * XP_PER_MINUTE;
  const completionBonus = input.completed ? COMPLETION_BONUS : 0;
  const taskLinkBonus = input.completed && input.linkedTaskCompletedInSession ? TASK_LINK_BONUS : 0;
  return {
    baseXp,
    completionBonus,
    taskLinkBonus,
    totalXp: baseXp + completionBonus + taskLinkBonus,
  };
}
