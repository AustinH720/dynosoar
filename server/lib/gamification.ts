import { getValues, updateRow, appendRow, clearRange, TABS, normalizeTime } from "./sheets.js";

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
  focus_session_completed: 15,
} as const;

export type XpSource = keyof typeof XP_RULES;

// Coins are only earned for *completions* — the real unit of "getting things
// done" — not for capturing/adding items.
const COIN_RULES: Partial<Record<XpSource, number>> = {
  task_completed: 8,
  freeform_completion: 6,
  routine_completed: 5,
  focus_session_completed: 6,
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
    "research", "learn", "school", "course", "exam", "practice set", "deep work", "focus", "pomodoro",
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

// ---------- Companion roster ----------
// Every companion shares the player's single global level/stage (see
// stageFromLevel above) — there is no separate per-companion XP track.
// Unlocking a new companion at a higher level is a deliberate design
// choice: each unlock level lines up with a STAGES tier boundary, so a
// stage-up moment and a new-companion moment always land together.
export type CompanionId = "mossback" | "riptide" | "chomp" | "noodle" | "stretch";

export interface CompanionMeta {
  id: CompanionId;
  name: string;
  species: string;
  unlockLevel: number;
}

export const COMPANIONS: CompanionMeta[] = [
  { id: "mossback", name: "Mossback", species: "Dinosaur", unlockLevel: 1 },
  { id: "riptide", name: "Riptide", species: "Mosasaurus", unlockLevel: 4 },
  { id: "chomp", name: "Chomp", species: "Liopleurodon", unlockLevel: 7 },
  { id: "noodle", name: "Noodle", species: "Elasmosaurus", unlockLevel: 11 },
  { id: "stretch", name: "Stretch", species: "Albertonectes", unlockLevel: 16 },
];

const DEFAULT_COMPANION: CompanionId = "mossback";

export function isCompanionId(value: string): value is CompanionId {
  return COMPANIONS.some((c) => c.id === value);
}

export function unlockedCompanions(level: number): CompanionMeta[] {
  return COMPANIONS.filter((c) => level >= c.unlockLevel);
}

// Player row column Q: ActiveCompanionId (string).
export async function getActiveCompanionId(): Promise<CompanionId> {
  const values = await getValues(TABS.PLAYER, "Q2:Q2");
  const raw = (values[0]?.[0] ?? "").trim();
  return isCompanionId(raw) ? raw : DEFAULT_COMPANION;
}

export async function setActiveCompanionId(
  id: string,
): Promise<{ ok: boolean; message?: string; activeCompanionId: CompanionId }> {
  if (!isCompanionId(id)) {
    return { ok: false, message: "That companion doesn't exist.", activeCompanionId: await getActiveCompanionId() };
  }
  const player = await getPlayerState();
  const meta = COMPANIONS.find((c) => c.id === id)!;
  if (player.level < meta.unlockLevel) {
    return {
      ok: false,
      message: `${meta.name} unlocks at level ${meta.unlockLevel}. You're level ${player.level}.`,
      activeCompanionId: await getActiveCompanionId(),
    };
  }
  await updateRow(TABS.PLAYER, "Q2:Q2", [id]);
  return { ok: true, activeCompanionId: id };
}

export async function getCompanionsState(): Promise<{
  companions: (CompanionMeta & { unlocked: boolean; stage: number; stageName: string })[];
  activeCompanionId: CompanionId;
  level: number;
  stage: number;
  stageName: string;
}> {
  const [player, activeCompanionId] = await Promise.all([getPlayerState(), getActiveCompanionId()]);
  const companions = COMPANIONS.map((c) => ({
    ...c,
    unlocked: player.level >= c.unlockLevel,
    stage: player.stage,
    stageName: player.stageName,
  }));
  return {
    companions,
    activeCompanionId,
    level: player.level,
    stage: player.stage,
    stageName: player.stageName,
  };
}

// ---------- Health / Daily Check-In (presence-based, visual only) ----------
// Drynosaur-style: one tap a day tops up the health bar and extends a streak.
// Task/quest completion still earns XP separately — it is NOT required to
// check in, and checking in never awards XP/coins itself. Health is purely
// a visual nudge with zero effect on XP, leveling, or skills.
function daysBetween(fromStr: string, toStr: string): number {
  const from = new Date(fromStr + "T00:00:00");
  const to = new Date(toStr + "T00:00:00");
  return Math.round((to.getTime() - from.getTime()) / 86400000);
}

export interface CheckinState {
  checkedInToday: boolean;
  streak: number;
  health: number; // 0-100, visual only
  tasksCompletedToday: number; // 0..dailyTaskGoal, for UI progress (e.g. "2/3 tasks today")
  dailyTaskGoal: number;
}

/**
 * Health decays only after a *missed* check-in day, never on the same day
 * you're still free to check in. lastHealthRefillDate is bumped by both
 * checking in and feeding, so either action tops the bar back to 100.
 */
function healthFromRefillDate(lastHealthRefillDate: string, todayStr: string): number {
  if (!lastHealthRefillDate) return 100;
  const days = daysBetween(lastHealthRefillDate, todayStr);
  if (days <= 1) return 100;
  const missed = days - 1;
  return Math.max(0, 100 - missed * 25);
}

// ---------- Health / Daily task goal (stacks with check-in decay) ----------
// A second, independent decay track: miss the daily task-completion goal and
// health takes a (smaller, per-day) hit too. The two tracks "stack" in the
// sense that whichever is worse on a given day wins — final health is the
// minimum of the check-in-based health and the task-goal-based health.
const DAILY_TASK_GOAL = 3;
const TASK_HEALTH_DECAY_RATE = 15; // percent per missed day, vs. 25% for check-in

function healthFromTaskGoalDate(lastTaskGoalMetDate: string, todayStr: string): number {
  if (!lastTaskGoalMetDate) return 100;
  const days = daysBetween(lastTaskGoalMetDate, todayStr);
  if (days <= 1) return 100;
  const missed = days - 1;
  return Math.max(0, 100 - missed * TASK_HEALTH_DECAY_RATE);
}

async function readCheckinRow(): Promise<{
  lastCheckIn: string;
  streak: number;
  lastHealthRefill: string;
  tasksCompletedTodayDate: string;
  tasksCompletedTodayCount: number;
  lastTaskGoalMetDate: string;
}> {
  const values = await getValues(TABS.PLAYER, "R2:W2");
  const row = values[0] ?? [];
  return {
    lastCheckIn: row[0] ?? "",
    streak: Number(row[1] ?? 0) || 0,
    lastHealthRefill: row[2] ?? "",
    tasksCompletedTodayDate: row[3] ?? "",
    tasksCompletedTodayCount: Number(row[4] ?? 0) || 0,
    lastTaskGoalMetDate: row[5] ?? "",
  };
}

export async function getCheckinState(): Promise<CheckinState> {
  const today = todayStrLocal();
  const { lastCheckIn, streak, lastHealthRefill, tasksCompletedTodayDate, tasksCompletedTodayCount, lastTaskGoalMetDate } =
    await readCheckinRow();
  const checkinHealth = healthFromRefillDate(lastHealthRefill, today);
  const taskHealth = healthFromTaskGoalDate(lastTaskGoalMetDate, today);
  const tasksToday = tasksCompletedTodayDate === today ? tasksCompletedTodayCount : 0;
  return {
    checkedInToday: lastCheckIn === today,
    streak,
    health: Math.min(checkinHealth, taskHealth),
    tasksCompletedToday: Math.min(tasksToday, DAILY_TASK_GOAL),
    dailyTaskGoal: DAILY_TASK_GOAL,
  };
}

export async function doCheckIn(): Promise<{ ok: boolean; alreadyCheckedIn: boolean; state: CheckinState }> {
  const today = todayStrLocal();
  const { lastCheckIn, streak } = await readCheckinRow();
  if (lastCheckIn === today) {
    return { ok: true, alreadyCheckedIn: true, state: await getCheckinState() };
  }
  const newStreak = lastCheckIn && daysBetween(lastCheckIn, today) === 1 ? streak + 1 : 1;
  await updateRow(TABS.PLAYER, "R2:T2", [today, newStreak, today]);
  return { ok: true, alreadyCheckedIn: false, state: await getCheckinState() };
}

/**
 * Called from awardXp() whenever a real task/routine/freeform/focus
 * completion happens. Bumps today's completion counter (resetting it if the
 * date rolled over) and, once the daily goal is hit, stamps
 * LastTaskGoalMetDate so healthFromTaskGoalDate() treats today as "goal met"
 * for decay purposes.
 */
async function recordTaskCompletionForHealth(): Promise<void> {
  const today = todayStrLocal();
  const { tasksCompletedTodayDate, tasksCompletedTodayCount, lastTaskGoalMetDate } = await readCheckinRow();
  const newCount = tasksCompletedTodayDate === today ? tasksCompletedTodayCount + 1 : 1;
  const newLastTaskGoalMetDate = newCount >= DAILY_TASK_GOAL ? today : lastTaskGoalMetDate;
  await updateRow(TABS.PLAYER, "U2:W2", [today, newCount, newLastTaskGoalMetDate]);
}

/** Feeding refills health (same visual top-up as check-in) without touching the streak. */
async function refillHealthOnly(): Promise<void> {
  const today = todayStrLocal();
  await updateRow(TABS.PLAYER, "T2:T2", [today]);
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
}

export async function getPlayerState(): Promise<PlayerState> {
  const values = await getValues(TABS.PLAYER, "A2:P2");
  const row = values[0] ?? [];
  const totalXp = Number(row[1] ?? 0) || 0;
  const info = levelFromXp(totalXp);
  const stage = stageFromLevel(info.level);
  // Player row columns: A User, B TotalXP, C Level, D Stage, E StageName,
  // F XPIntoLevel, G XPToNextLevel, H LastUpdated, I ThemeMode, J Accent,
  // K BackgroundScene, L Coins, M StrengthXP, N SmarterXP, O FishingXP, P LastActivityDate,
  // Q ActiveCompanionId, R LastCheckInDate, S CheckInStreak, T LastHealthRefillDate,
  // U TasksCompletedTodayDate, V TasksCompletedTodayCount, W LastTaskGoalMetDate.
  const coins = Number(row[11] ?? 0) || 0;
  const strengthXp = Number(row[12] ?? 0) || 0;
  const smarterXp = Number(row[13] ?? 0) || 0;
  const fishingXp = Number(row[14] ?? 0) || 0;
  return {
    ...info,
    ...stage,
    coins,
    skills: [
      { id: "strength", label: "Strength", emoji: "💪", xp: strengthXp },
      { id: "smarter", label: "Smarter", emoji: "🧠", xp: smarterXp },
      { id: "fishing", label: "Fishing", emoji: "🎣", xp: fishingXp },
    ],
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
  const isCompletion =
    source === "task_completed" ||
    source === "freeform_completion" ||
    source === "routine_completed" ||
    source === "focus_session_completed";
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

  if (isCompletion) {
    await recordTaskCompletionForHealth();
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

// ---------- Feed ----------
// Feeding is a simple, always-available coin sink separate from the Shop
// below: spend coins to give your companion a snack, which tops up the
// visual health bar (same effect as a daily check-in) without touching the
// check-in streak.
export interface FeedItem {
  id: string;
  name: string;
  emoji: string;
  cost: number;
  description: string;
}

export const FEED_ITEMS: FeedItem[] = [
  { id: "berries", name: "Wild Berries", emoji: "🫐", cost: 10, description: "A quick snack to perk them up." },
  { id: "fish", name: "Fresh Fish", emoji: "🐟", cost: 20, description: "A hearty catch-of-the-day meal." },
  { id: "feast", name: "Jungle Feast", emoji: "🍖", cost: 40, description: "A full spread fit for a dino." },
  { id: "treat", name: "Golden Treat", emoji: "✨", cost: 75, description: "A rare, shimmering delicacy." },
];

export async function getFeedState(): Promise<{ items: FeedItem[]; coins: number; health: number }> {
  const [player, checkin] = await Promise.all([getPlayerState(), getCheckinState()]);
  return { items: FEED_ITEMS, coins: player.coins, health: checkin.health };
}

export async function feedCompanion(
  itemId: string,
): Promise<{ ok: boolean; message?: string; coins?: number; health?: number }> {
  const item = FEED_ITEMS.find((i) => i.id === itemId);
  if (!item) return { ok: false, message: "That food doesn't exist." };
  const player = await getPlayerState();
  if (player.coins < item.cost) return { ok: false, message: "Not enough coins for that." };

  const newCoins = player.coins - item.cost;
  await writePlayerSkillsAndCoins({ coins: newCoins });
  await refillHealthOnly();
  const checkin = await getCheckinState();
  return { ok: true, coins: newCoins, health: checkin.health };
}

// ---------- Shop ----------
// Equip slots mirror how the accessory would actually sit on the companion:
// only one item can occupy a given slot at a time, but different slots can
// all be equipped together (e.g. a headband + glasses + a cape at once).
// Furniture/collectible items have no slot — they're just "Owned" keepsakes.
export type ItemSlot = "head" | "face" | "body" | "back" | "held";

const SLOT_BY_ITEM: Record<string, ItemSlot> = {
  "Warrior Headband": "head",
  "Graduation Cap": "head",
  "Fisherman's Hat": "head",
  "Reading Glasses": "face",
  "Wizard Robe": "body",
  "Champion's Cape": "back",
  "Resistance Bands": "held",
  "Iron Dumbbell Charm": "held",
  "Scholar's Notebook": "held",
  "Tackle Box": "held",
  "Basic Fishing Rod": "held",
  "Golden Fishing Rod": "held",
};

// A single representative emoji per item — cheap, crisp at any size, and
// needs no image pipeline. Doubles as the shop card's icon tile.
export const ITEM_EMOJI: Record<string, string> = {
  "Resistance Bands": "🏋️",
  "Iron Dumbbell Charm": "💪",
  "Warrior Headband": "⚔️",
  "Home Gym Corner": "🏠",
  "Champion's Cape": "🦸",
  "Reading Glasses": "👓",
  "Scholar's Notebook": "📔",
  "Graduation Cap": "🎓",
  "Study Desk": "🪑",
  "Wizard Robe": "🧙",
  "Basic Fishing Rod": "🎣",
  "Tackle Box": "🧰",
  "Fisherman's Hat": "👒",
  "Aquarium Nook": "🐠",
  "Golden Fishing Rod": "🎣",
};

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
  emoji: string;
  slot: ItemSlot | null;
  equipped: boolean;
}

export interface EquippedItem {
  slot: ItemSlot;
  name: string;
  emoji: string;
  skill: SkillId;
}

const SKILL_LABEL_TO_ID: Record<string, SkillId> = {
  strength: "strength",
  smarter: "smarter",
  fishing: "fishing",
};

export async function getShopItems(): Promise<{ items: ShopItem[]; coins: number; skills: SkillState[] }> {
  const [values, player] = await Promise.all([
    getValues(TABS.SHOP, "A2:H200"),
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
      const name = r.cells[0] ?? "";
      const skill = SKILL_LABEL_TO_ID[(r.cells[1] ?? "").toLowerCase()] ?? "strength";
      const xpRequired = Number(r.cells[3] ?? 0) || 0;
      const coinCost = Number(r.cells[4] ?? 0) || 0;
      const owned = (r.cells[6] ?? "").toString().toUpperCase() === "TRUE";
      const equipped = owned && (r.cells[7] ?? "").toString().toUpperCase() === "TRUE";
      const unlocked = skillXpById[skill] >= xpRequired;
      return {
        row: r.row,
        name,
        skill,
        type: r.cells[2] ?? "",
        xpRequired,
        coinCost,
        description: r.cells[5] ?? "",
        owned,
        unlocked,
        canAfford: unlocked && !owned && player.coins >= coinCost,
        emoji: ITEM_EMOJI[name] ?? "🎁",
        slot: SLOT_BY_ITEM[name] ?? null,
        equipped,
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

export async function equipShopItem(row: number, equip: boolean): Promise<{ ok: boolean; message?: string }> {
  const { items } = await getShopItems();
  const item = items.find((i) => i.row === row);
  if (!item) return { ok: false, message: "Item not found" };
  if (!item.owned) return { ok: false, message: "You don't own this item yet" };
  if (!item.slot) return { ok: false, message: "This item can't be equipped" };

  if (equip) {
    // Only one item per slot — unequip whatever else is currently there.
    const conflicting = items.filter((i) => i.slot === item.slot && i.equipped && i.row !== row);
    for (const c of conflicting) {
      await updateRow(TABS.SHOP, `H${c.row}`, ["FALSE"]);
    }
    await updateRow(TABS.SHOP, `H${row}`, ["TRUE"]);
  } else {
    await updateRow(TABS.SHOP, `H${row}`, ["FALSE"]);
  }
  return { ok: true };
}

export async function getEquippedItems(): Promise<EquippedItem[]> {
  const { items } = await getShopItems();
  return items
    .filter((i) => i.equipped && i.slot)
    .map((i) => ({ slot: i.slot as ItemSlot, name: i.name, emoji: i.emoji, skill: i.skill }));
}

// ---------- Recurring routine checklist ----------
export const DAY_CODES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
const DAY_INDEX: Record<string, number> = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };

/**
 * Parses a routine's free-text/canonical "days" field into the set of weekday
 * indices (0=Sun..6=Sat) it runs on. Understands both the structured
 * "Mon,Wed,Fri" form written by the Routine tab and legacy free-text labels
 * ("Daily", "Weekdays", "Weekends", "Weekly (Wed)") from earlier capture flows.
 * Falls back to "every day" when nothing recognizable is found, so an
 * ambiguous legacy row is never silently hidden from the checklist.
 */
export function parseDaysToSet(days: string): Set<number> {
  const norm = (days || "").toLowerCase();
  if (!norm.trim()) return new Set([0, 1, 2, 3, 4, 5, 6]);
  if (/\bdaily\b|\bevery ?day\b/.test(norm)) return new Set([0, 1, 2, 3, 4, 5, 6]);
  if (/\bweekday/.test(norm)) return new Set([1, 2, 3, 4, 5]);
  if (/\bweekend/.test(norm)) return new Set([0, 6]);

  // Legacy free-text range form, e.g. "Mon-Fri", "Mon\u2013Fri", "Tue to Thu".
  // Expand it to every weekday in the inclusive range instead of only the
  // two endpoints so mid-range days aren't silently dropped from "today".
  const rangeMatch = norm.match(/\b(sun|mon|tue|wed|thu|fri|sat)[a-z]*\s*(?:-|\u2013|\u2014|to)\s*(sun|mon|tue|wed|thu|fri|sat)[a-z]*\b/);
  if (rangeMatch) {
    const start = DAY_INDEX[rangeMatch[1]];
    const end = DAY_INDEX[rangeMatch[2]];
    if (start != null && end != null) {
      const set = new Set<number>();
      let i = start;
      while (true) {
        set.add(i);
        if (i === end) break;
        i = (i + 1) % 7;
      }
      return set;
    }
  }

  const set = new Set<number>();
  for (const [key, idx] of Object.entries(DAY_INDEX)) {
    if (new RegExp(`\\b${key}`).test(norm)) set.add(idx);
  }
  return set.size > 0 ? set : new Set([0, 1, 2, 3, 4, 5, 6]);
}

/** Builds a canonical, storage-friendly days string from selected weekday indices. */
export function daysSetToLabel(indices: number[]): string {
  const sorted = Array.from(new Set(indices)).sort();
  if (sorted.length === 7) return "Daily";
  if (sorted.length === 5 && [1, 2, 3, 4, 5].every((d) => sorted.includes(d))) return "Weekdays";
  if (sorted.length === 2 && [0, 6].every((d) => sorted.includes(d))) return "Weekends";
  return sorted.map((i) => DAY_CODES[i]).join(",");
}

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
  scheduledToday: boolean;
}

export async function getRoutineItems(todayStr: string, weekday: number): Promise<RoutineItem[]> {
  const values = await getValues(TABS.ROUTINE, "A2:G200");
  return values
    .map((row, i) => ({ row: i + 2, cells: row }))
    .filter((r) => r.cells[1])
    .map((r) => ({
      row: r.row,
      timeBlock: normalizeTime(r.cells[0]),
      activity: r.cells[1] ?? "",
      days: r.cells[2] ?? "",
      type: r.cells[3] ?? "",
      autoAdd: r.cells[4] ?? "",
      notes: r.cells[5] ?? "",
      lastCompleted: r.cells[6] ?? "",
      doneToday: (r.cells[6] ?? "") === todayStr,
      scheduledToday: parseDaysToSet(r.cells[2] ?? "").has(weekday),
    }));
}

export async function createRoutineItem(data: {
  timeBlock: string;
  activity: string;
  days: string;
  category?: string;
  notes?: string;
}): Promise<void> {
  await appendRow(TABS.ROUTINE, [
    data.timeBlock ?? "",
    data.activity,
    data.days,
    data.category ?? "General",
    "No",
    data.notes ?? "",
    "",
  ]);
}

export async function updateRoutineItem(
  row: number,
  data: { timeBlock?: string; activity?: string; days?: string; category?: string; notes?: string },
): Promise<void> {
  const existing = await getValues(TABS.ROUTINE, `A${row}:G${row}`);
  const prev = existing[0] ?? [];
  const timeBlock = data.timeBlock ?? prev[0] ?? "";
  const activity = data.activity ?? prev[1] ?? "";
  const days = data.days ?? prev[2] ?? "";
  const category = data.category ?? prev[3] ?? "General";
  const autoAdd = prev[4] ?? "No";
  const notes = data.notes ?? prev[5] ?? "";
  const lastCompleted = prev[6] ?? "";
  await updateRow(TABS.ROUTINE, `A${row}:G${row}`, [timeBlock, activity, days, category, autoAdd, notes, lastCompleted]);
}

export async function deleteRoutineItem(row: number): Promise<void> {
  await clearRange(TABS.ROUTINE, `A${row}:G${row}`);
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

// ---------- My Day (voice-planned daily checklist) ----------
// "My Day" items live in the same Tasks tab as everything else (category
// "My Day", dueDate = today) so the existing task-completion + XP pipeline
// is reused as-is. Unlike /api/tasks, planning a day does NOT sync to
// Todoist/Calendar — these are quick, ephemeral voice-captured items for
// today only, not durable cross-app tasks.
const MY_DAY_CATEGORY = "My Day";

export interface MyDayItem {
  row: number;
  task: string;
  status: string;
}

export async function planMyDay(items: string[]): Promise<{ created: number; xpAwarded: number }> {
  const today = todayStrLocal();
  let xpAwarded = 0;
  for (const raw of items) {
    const task = raw.trim();
    if (!task) continue;
    await appendRow(TABS.TASKS, [task, MY_DAY_CATEGORY, today, "Medium", "Not Started", "My Day (voice)", today, "", ""]);
    const xp = await awardXp("task_added", task, MY_DAY_CATEGORY, "");
    xpAwarded += xp.xpAwarded;
  }
  return { created: items.filter((i) => i.trim()).length, xpAwarded };
}

export async function getMyDayItems(): Promise<MyDayItem[]> {
  const today = todayStrLocal();
  const values = await getValues(TABS.TASKS, "A2:I2000");
  return values
    .map((row, i) => ({ row: i + 2, cells: row }))
    .filter((r) => r.cells[0] && r.cells[1] === MY_DAY_CATEGORY && r.cells[2] === today)
    .map((r) => ({ row: r.row, task: r.cells[0] ?? "", status: r.cells[4] ?? "Not Started" }));
}

// ---------- Focus (Pomodoro) sessions ----------
// Fixed 25-minute focus / 5-minute break cycle, kicked off by tapping the
// companion on the dedicated Focus page. Only a session that runs to
// completion (not cancelled early) is logged and rewarded — it awards XP
// + coins like any other completion and counts toward the daily 3-task
// health goal via awardXp()'s existing isCompletion hook.
export const FOCUS_WORK_MINUTES = 25;
export const FOCUS_BREAK_MINUTES = 5;

export interface FocusCompleteResult {
  xp: AwardResult;
  sessionsToday: number;
}

export async function logFocusSessionComplete(durationMinutes: number): Promise<FocusCompleteResult> {
  const xp = await awardXp("focus_session_completed", "Focus session", "Focus", "focus pomodoro");
  await appendRow(TABS.FOCUS_LOG, [
    new Date().toISOString(),
    durationMinutes,
    "Yes",
    "",
    "",
    xp.xpAwarded,
  ]);
  const sessionsToday = await countFocusSessionsToday();
  return { xp, sessionsToday };
}

export async function countFocusSessionsToday(): Promise<number> {
  const today = todayStrLocal();
  const values = await getValues(TABS.FOCUS_LOG, "A2:C2000");
  return values.filter((row) => {
    const ts = row[0] ?? "";
    const completed = row[2] ?? "";
    return completed === "Yes" && ts.startsWith(today);
  }).length;
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

// ---------- Fuzzy match free text against upcoming events, for cancellation ----------
const CANCEL_LEAD = /^(i\s+(want|need)\s+to\s+|please\s+|can\s+you\s+)?(cancel|remove|delete)\b/i;

export function isCancellationPhrase(text: string): boolean {
  return CANCEL_LEAD.test(text.trim());
}

export interface OpenEvent {
  row: number;
  title: string;
  date: string;
  eventId: string;
}

/** Returns the best-matching upcoming event above a similarity threshold, or null. */
export function findBestEventMatch(text: string, events: OpenEvent[]): OpenEvent | null {
  // Strip the leading cancellation verb phrase so "cancel my call mortgage
  // broker renewal" matches against "call mortgage broker renewal", not
  // diluted by "cancel"/"remove"/"delete" tokens that never appear in titles.
  const stripped = text.replace(CANCEL_LEAD, "");
  const inputTokens = tokenize(stripped);
  if (inputTokens.size === 0) return null;

  let best: OpenEvent | null = null;
  let bestScore = 0;
  for (const e of events) {
    const titleTokens = tokenize(e.title);
    if (titleTokens.size === 0) continue;
    let overlap = 0;
    for (const w of titleTokens) if (inputTokens.has(w)) overlap += 1;
    const score = overlap / Math.min(inputTokens.size, titleTokens.size);
    if (score > bestScore) {
      bestScore = score;
      best = e;
    }
  }
  return bestScore >= 0.5 ? best : null;
}
