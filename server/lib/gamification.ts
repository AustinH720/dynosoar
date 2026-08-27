import { getValues, updateRow, appendRow, TABS } from "./sheets.js";

// ---------- XP rules ----------
// Simplified from the Life RPG blueprint (SDT-aligned): reward showing up,
// reward the real unit of effort more, reward completion the most. No XP is
// ever subtracted for missed days — only additive awards.
export const XP_RULES = {
  task_added: 8,
  event_added: 10,
  recurring_added: 12,
  note_added: 4,
  task_completed: 20,
  freeform_completion: 15,
  routine_completed: 10,
} as const;

export type XpSource = keyof typeof XP_RULES;

// Coins are only earned for *completions* — the real unit of "getting things
// done" — not for capturing/adding items.
const COIN_RULES: Partial<Record<XpSource, number>> = {
  task_completed: 8,
  freeform_completion: 6,
  routine_completed: 5,
};

// ---------- Skill tracks (RuneScape-style) ----------
// A completed task/routine is mapped to a skill by matching its category,
// project, and activity text against keyword sets. Unmatched completions
// still award main dino XP + coins, just no skill-specific XP.
export type SkillId = "strength" | "smarter" | "fishing";

export const SKILLS: { id: SkillId; label: string; emoji: string }[] = [
  { id: "strength", label: "Strength", emoji: "💪" },
  { id: "smarter", label: "Smarter", emoji: "🧠" },
  { id: "fishing", label: "Fishing", emoji: "🎣" },
];

const SKILL_KEYWORDS: Record<SkillId, string[]> = {
  strength: ["workout", "gym", "fitness", "exercise", "run", "strength", "training", "lift"],
  smarter: [
    "study", "work", "job", "recruit", "cfa", "read", "reading", "interview", "real estate",
    "research", "learn", "school", "course", "exam", "practice set", "deep work",
  ],
  fishing: ["fish", "tank", "aquarium", "filter"],
};

export function categorizeSkill(...texts: (string | null | undefined)[]): SkillId | null {
  const combined = texts.filter(Boolean).join(" ").toLowerCase();
  if (!combined.trim()) return null;
  for (const skill of SKILLS) {
    if (SKILL_KEYWORDS[skill.id].some((kw) => combined.includes(kw))) {
      return skill.id;
    }
  }
  return null;
}

// ---------- Leveling curve ----------
// XP to go from level N -> N+1 = 100 + 25*(N-1). Deliberately fast early,
// slower later, matching the blueprint's retention design.
function xpForLevel(level: number): number {
  return 100 + 25 * (level - 1);
}

export interface LevelInfo {
  level: number;
  xpIntoLevel: number;
  xpToNextLevel: number;
  totalXp: number;
}

export function levelFromXp(totalXp: number): LevelInfo {
  let level = 1;
  let remaining = totalXp;
  while (remaining >= xpForLevel(level)) {
    remaining -= xpForLevel(level);
    level += 1;
  }
  return {
    level,
    xpIntoLevel: remaining,
    xpToNextLevel: xpForLevel(level),
    totalXp,
  };
}

// ---------- Companion evolution stages ----------
export interface StageInfo {
  stage: number;
  stageName: string;
  levelRange: string;
}

const STAGES: { minLevel: number; stage: number; stageName: string; levelRange: string }[] = [
  { minLevel: 16, stage: 5, stageName: "Legendary", levelRange: "Lv. 16+" },
  { minLevel: 11, stage: 4, stageName: "Guardian", levelRange: "Lv. 11–15" },
  { minLevel: 7, stage: 3, stageName: "Adventurer", levelRange: "Lv. 7–10" },
  { minLevel: 4, stage: 2, stageName: "Sprout", levelRange: "Lv. 4–6" },
  { minLevel: 1, stage: 1, stageName: "Hatchling", levelRange: "Lv. 1–3" },
];

export function stageFromLevel(level: number): StageInfo {
  const match = STAGES.find((s) => level >= s.minLevel)!;
  return { stage: match.stage, stageName: match.stageName, levelRange: match.levelRange };
}

// ---------- Hunger (neglect) ----------
export type HungerLevel = "fed" | "peckish" | "hungry";

export interface HungerInfo {
  level: HungerLevel;
  daysSinceActivity: number | null;
  message: string;
}

function daysBetween(fromStr: string, toStr: string): number {
  const from = new Date(fromStr + "T00:00:00");
  const to = new Date(toStr + "T00:00:00");
  return Math.round((to.getTime() - from.getTime()) / 86400000);
}

export function hungerFromActivity(lastActivityDate: string, todayStr: string): HungerInfo {
  if (!lastActivityDate) {
    return { level: "fed", daysSinceActivity: null, message: "Complete a task to start feeding Mossback!" };
  }
  const days = daysBetween(lastActivityDate, todayStr);
  if (days <= 1) {
    return { level: "fed", daysSinceActivity: days, message: "Well fed and happy." };
  }
  if (days <= 3) {
    return {
      level: "peckish",
      daysSinceActivity: days,
      message: `Getting hungry — it's been ${days} days since your last completed task.`,
    };
  }
  return {
    level: "hungry",
    daysSinceActivity: days,
    message: `Mossback is hungry! It's been ${days} days — complete a task to feed them.`,
  };
}

// ---------- Player state read/write ----------
export interface SkillState {
  id: SkillId;
  label: string;
  emoji: string;
  xp: number;
}

export interface PlayerState extends LevelInfo, StageInfo {
  coins: number;
  skills: SkillState[];
  hunger: HungerInfo;
}

export async function getPlayerState(): Promise<PlayerState> {
  const values = await getValues(TABS.PLAYER, "A2:P2");
  const row = values[0] ?? [];
  const totalXp = Number(row[1] ?? 0) || 0;
  const info = levelFromXp(totalXp);
  const stage = stageFromLevel(info.level);
  // Player row columns: A User, B TotalXP, C Level, D Stage, E StageName,
  // F XPIntoLevel, G XPToNextLevel, H LastUpdated, I ThemeMode, J Accent,
  // K BackgroundScene, L Coins, M StrengthXP, N SmarterXP, O FishingXP, P LastActivityDate.
  const coins = Number(row[11] ?? 0) || 0;
  const strengthXp = Number(row[12] ?? 0) || 0;
  const smarterXp = Number(row[13] ?? 0) || 0;
  const fishingXp = Number(row[14] ?? 0) || 0;
  const lastActivityDate = row[15] ?? "";
  const today = todayStrLocal();
  return {
    ...info,
    ...stage,
    coins,
    skills: [
      { id: "strength", label: "Strength", emoji: "💪", xp: strengthXp },
      { id: "smarter", label: "Smarter", emoji: "🧠", xp: smarterXp },
      { id: "fishing", label: "Fishing", emoji: "🎣", xp: fishingXp },
    ],
    hunger: hungerFromActivity(lastActivityDate, today),
  };
}

function todayStrLocal(): string {
  // Matches server/lib/time.ts's America/Toronto convention used elsewhere.
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Toronto" });
}

async function readRawPlayerRow(): Promise<string[]> {
  const values = await getValues(TABS.PLAYER, "A2:P2");
  return values[0] ?? [];
}

async function writePlayerCore(state: LevelInfo & StageInfo) {
  await updateRow(TABS.PLAYER, "B2:H2", [
    state.totalXp,
    state.level,
    state.stage,
    state.stageName,
    state.xpIntoLevel,
    state.xpToNextLevel,
    new Date().toISOString(),
  ]);
}

async function writePlayerSkillsAndCoins(opts: {
  coins?: number;
  strengthXp?: number;
  smarterXp?: number;
  fishingXp?: number;
  lastActivityDate?: string;
}) {
  const raw = await readRawPlayerRow();
  const coins = opts.coins ?? (Number(raw[11] ?? 0) || 0);
  const strengthXp = opts.strengthXp ?? (Number(raw[12] ?? 0) || 0);
  const smarterXp = opts.smarterXp ?? (Number(raw[13] ?? 0) || 0);
  const fishingXp = opts.fishingXp ?? (Number(raw[14] ?? 0) || 0);
  const lastActivityDate = opts.lastActivityDate ?? raw[15] ?? "";
  await updateRow(TABS.PLAYER, "L2:P2", [coins, strengthXp, smarterXp, fishingXp, lastActivityDate]);
}

export interface AwardResult {
  player: PlayerState;
  xpAwarded: number;
  coinsAwarded: number;
  skill: SkillId | null;
  leveledUp: boolean;
  stageChanged: boolean;
}

export async function awardXp(
  source: XpSource,
  description: string,
  category: string = "",
  extraSkillText: string = "",
): Promise<AwardResult> {
  const before = await getPlayerState();
  const xpAwarded = XP_RULES[source];
  const newTotal = before.totalXp + xpAwarded;
  const info = levelFromXp(newTotal);
  const stage = stageFromLevel(info.level);

  await writePlayerCore({ ...info, ...stage });

  const coinsAwarded = COIN_RULES[source] ?? 0;
  const isCompletion = source === "task_completed" || source === "freeform_completion" || source === "routine_completed";
  const skill = isCompletion ? categorizeSkill(category, extraSkillText, description) : null;

  const skillPatch: Parameters<typeof writePlayerSkillsAndCoins>[0] = {};
  if (coinsAwarded) skillPatch.coins = before.coins + coinsAwarded;
  if (skill === "strength") skillPatch.strengthXp = before.skills[0].xp + xpAwarded;
  if (skill === "smarter") skillPatch.smarterXp = before.skills[1].xp + xpAwarded;
  if (skill === "fishing") skillPatch.fishingXp = before.skills[2].xp + xpAwarded;
  if (isCompletion) skillPatch.lastActivityDate = todayStrLocal();

  if (Object.keys(skillPatch).length > 0) {
    await writePlayerSkillsAndCoins(skillPatch);
  }

  const after = await getPlayerState();

  await appendRow(TABS.XP_LEDGER, [
    new Date().toISOString(),
    source,
    description,
    xpAwarded,
    newTotal,
    skill ? `${category} [${skill}]` : category,
  ]);

  return {
    player: after,
    xpAwarded,
    coinsAwarded,
    skill,
    leveledUp: after.level > before.level,
    stageChanged: after.stage > before.stage,
  };
}

// ---------- Shop ----------
export interface ShopItem {
  row: number;
  name: string;
  skill: SkillId;
  type: string;
  xpRequired: number;
  coinCost: number;
  description: string;
  owned: boolean;
  unlocked: boolean;
  canAfford: boolean;
}

const SKILL_LABEL_TO_ID: Record<string, SkillId> = {
  strength: "strength",
  smarter: "smarter",
  fishing: "fishing",
};

export async function getShopItems(): Promise<{ items: ShopItem[]; coins: number; skills: SkillState[] }> {
  const [values, player] = await Promise.all([
    getValues(TABS.SHOP, "A2:G200"),
    getPlayerState(),
  ]);
  const skillXpById: Record<SkillId, number> = {
    strength: player.skills[0].xp,
    smarter: player.skills[1].xp,
    fishing: player.skills[2].xp,
  };

  const items: ShopItem[] = values
    .map((row, i) => ({ row: i + 2, cells: row }))
    .filter((r) => r.cells[0])
    .map((r) => {
      const skill = SKILL_LABEL_TO_ID[(r.cells[1] ?? "").toLowerCase()] ?? "strength";
      const xpRequired = Number(r.cells[3] ?? 0) || 0;
      const coinCost = Number(r.cells[4] ?? 0) || 0;
      const owned = (r.cells[6] ?? "").toString().toUpperCase() === "TRUE";
      const unlocked = skillXpById[skill] >= xpRequired;
      return {
        row: r.row,
        name: r.cells[0] ?? "",
        skill,
        type: r.cells[2] ?? "",
        xpRequired,
        coinCost,
        description: r.cells[5] ?? "",
        owned,
        unlocked,
        canAfford: unlocked && !owned && player.coins >= coinCost,
      };
    });

  return { items, coins: player.coins, skills: player.skills };
}

export async function purchaseShopItem(row: number): Promise<{ ok: boolean; message?: string; coins?: number }> {
  const { items, coins } = await getShopItems();
  const item = items.find((i) => i.row === row);
  if (!item) return { ok: false, message: "Item not found" };
  if (item.owned) return { ok: false, message: "You already own this item" };
  if (!item.unlocked) return { ok: false, message: `Unlock at ${item.xpRequired} ${item.skill} XP first` };
  if (coins < item.coinCost) return { ok: false, message: "Not enough coins" };

  await updateRow(TABS.SHOP, `G${row}`, ["TRUE"]);
  const newCoins = coins - item.coinCost;
  await writePlayerSkillsAndCoins({ coins: newCoins });
  return { ok: true, coins: newCoins };
}

// ---------- Recurring routine checklist ----------
export interface RoutineItem {
  row: number;
  timeBlock: string;
  activity: string;
  days: string;
  type: string;
  autoAdd: string;
  notes: string;
  lastCompleted: string;
  doneToday: boolean;
}

export async function getRoutineItems(todayStr: string): Promise<RoutineItem[]> {
  const values = await getValues(TABS.ROUTINE, "A2:G200");
  return values
    .map((row, i) => ({ row: i + 2, cells: row }))
    .filter((r) => r.cells[1])
    .map((r) => ({
      row: r.row,
      timeBlock: r.cells[0] ?? "",
      activity: r.cells[1] ?? "",
      days: r.cells[2] ?? "",
      type: r.cells[3] ?? "",
      autoAdd: r.cells[4] ?? "",
      notes: r.cells[5] ?? "",
      lastCompleted: r.cells[6] ?? "",
      doneToday: (r.cells[6] ?? "") === todayStr,
    }));
}

export interface RoutineToggleResult {
  doneToday: boolean;
  xp: AwardResult | null;
}

export async function toggleRoutineComplete(
  row: number,
  activity: string,
  todayStr: string,
): Promise<RoutineToggleResult> {
  const values = await getValues(TABS.ROUTINE, `A${row}:G${row}`);
  const current = values[0]?.[6] ?? "";
  const type = values[0]?.[3] ?? "";
  if (current === todayStr) {
    await updateRow(TABS.ROUTINE, `G${row}`, [""]);
    return { doneToday: false, xp: null };
  }
  await updateRow(TABS.ROUTINE, `G${row}`, [todayStr]);
  const xp = await awardXp("routine_completed", activity, type, activity);
  return { doneToday: true, xp };
}

// ---------- Fuzzy match free text against open tasks ----------
export interface OpenTask {
  row: number;
  task: string;
  status: string;
}

const STOPWORDS = new Set([
  "the", "a", "an", "to", "for", "of", "and", "on", "at", "in", "with", "i", "my",
  "just", "finally", "done", "finished", "completed", "complete", "did",
]);

function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 1 && !STOPWORDS.has(w)),
  );
}

/** Returns the best-matching open task above a similarity threshold, or null. */
export function findBestTaskMatch(text: string, tasks: OpenTask[]): OpenTask | null {
  const inputTokens = tokenize(text);
  if (inputTokens.size === 0) return null;

  let best: OpenTask | null = null;
  let bestScore = 0;

  for (const t of tasks) {
    if (t.status === "Completed") continue;
    const taskTokens = tokenize(t.task);
    if (taskTokens.size === 0) continue;
    let overlap = 0;
    for (const w of taskTokens) if (inputTokens.has(w)) overlap += 1;
    const score = overlap / Math.min(inputTokens.size, taskTokens.size);
    if (score > bestScore) {
      bestScore = score;
      best = t;
    }
  }

  return bestScore >= 0.5 ? best : null;
}

const COMPLETION_PATTERN =
  /^(i\s+)?(just\s+|finally\s+)?(completed|finished|did|done with|wrapped up|knocked out)\b|^(mark(ed)?\s+.*\s+(as\s+)?(done|complete|completed))\b|\bdone\b\s*$/i;

export function isCompletionPhrase(text: string): boolean {
  return COMPLETION_PATTERN.test(text.trim());
}
