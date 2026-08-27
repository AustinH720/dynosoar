import { getValues, TABS } from "./sheets.js";

function normalize(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ");
}

function bigrams(s: string): Set<string> {
  const padded = ` ${s} `;
  const set = new Set<string>();
  for (let i = 0; i < padded.length - 1; i++) set.add(padded.slice(i, i + 2));
  return set;
}

/** Dice coefficient over character bigrams — robust to small wording changes. */
function similarity(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const A = bigrams(a);
  const B = bigrams(b);
  let overlap = 0;
  for (const g of A) if (B.has(g)) overlap += 1;
  return (2 * overlap) / (A.size + B.size);
}

export interface DuplicateMatch {
  text: string;
  date: string;
}

const DUPLICATE_THRESHOLD = 0.82;
const LOOKBACK_DAYS = 30;

/**
 * Checks recent Tasks or Notes entries for a near-duplicate of `text`.
 * Only used for Task/Note style entries — Events and Recurring items are
 * legitimately repeated (e.g. weekly meetings) so they're excluded.
 */
export async function findRecentDuplicate(
  text: string,
  type: "Task" | "Note",
): Promise<DuplicateMatch | null> {
  const norm = normalize(text);
  if (!norm) return null;

  const cutoff = Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000;
  const tab = type === "Task" ? TABS.TASKS : TABS.NOTES;
  const range = type === "Task" ? "A2:G2000" : "A2:D2000";
  const textCol = type === "Task" ? 0 : 1;
  const dateCol = type === "Task" ? 6 : 0;

  const values = await getValues(tab, range);
  let best: DuplicateMatch | null = null;
  let bestScore = 0;

  for (const row of values) {
    const cell = row[textCol];
    if (!cell) continue;
    const dateStr = row[dateCol] || "";
    const parsed = Date.parse(dateStr);
    if (!Number.isNaN(parsed) && parsed < cutoff) continue;

    const score = similarity(norm, normalize(cell));
    if (score > bestScore) {
      bestScore = score;
      best = { text: cell, date: dateStr };
    }
  }

  return bestScore >= DUPLICATE_THRESHOLD ? best : null;
}
