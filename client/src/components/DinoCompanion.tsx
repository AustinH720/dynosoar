import { useEffect, useState, type ReactNode } from "react";
import stage1 from "@/assets/dino/stage1.png";
import { COMPANION_REGISTRY, type CompanionId } from "@/data/companions";
import fieldBg from "@/assets/backgrounds/field.jpg";
import forestBg from "@/assets/backgrounds/forest.jpg";
import beachBg from "@/assets/backgrounds/beach.jpg";
import volcanoBg from "@/assets/backgrounds/volcano.jpg";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Heart, Flame } from "lucide-react";
import { cn } from "@/lib/utils";
import { AnimatedCompanion } from "@/components/AnimatedCompanion";

export interface PlayerState {
  level: number;
  xpIntoLevel: number;
  xpToNextLevel: number;
  totalXp: number;
  stage: number;
  stageName: string;
  levelRange: string;
  coins?: number;
}

export interface CheckinInfo {
  checkedInToday: boolean;
  streak: number;
  health: number;
  tasksCompletedToday?: number;
  dailyTaskGoal?: number;
}

export interface EquippedItem {
  slot: string;
  name: string;
  emoji: string;
  skill: string;
}

export const BACKGROUND_SCENES: Record<string, { label: string; src: string }> = {
  field: { label: "Field", src: fieldBg },
  forest: { label: "Forest", src: forestBg },
  beach: { label: "Beach", src: beachBg },
  volcano: { label: "Volcano", src: volcanoBg },
};

/**
 * Each background scene has one "correlated" accent color pulled from its
 * dominant palette (sunny sky, canopy green, ocean water, lava glow). The
 * accent is fully derived from whichever scene is active, so there's no
 * separate manual accent picker to keep in sync.
 */
export const SCENE_ACCENTS: Record<string, string> = {
  field: "indigo",
  forest: "emerald",
  beach: "teal",
  volcano: "amber",
};

/** Auto scene mapping: earlier dino stages get calmer scenes, later stages get bolder ones. */
export function sceneForStage(stage: number): string {
  if (stage <= 2) return "field";
  if (stage === 3) return "forest";
  if (stage === 4) return "beach";
  return "volcano";
}

const BLINK_INTERVAL_MS = 4000;
const BLINK_DURATION_MS = 1400;

export function DinoCompanion({
  player,
  companionId = "mossback",
  backgroundScene,
  checkin,
  equippedItems,
  children,
  onImageClick,
}: {
  player?: PlayerState;
  companionId?: CompanionId;
  backgroundScene?: string;
  checkin?: CheckinInfo;
  equippedItems?: EquippedItem[];
  children?: ReactNode;
  onImageClick?: () => void;
}) {
  const companion = COMPANION_REGISTRY[companionId] ?? COMPANION_REGISTRY.mossback;
  const [blinking, setBlinking] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => {
      setBlinking(true);
      const t = setTimeout(() => setBlinking(false), BLINK_DURATION_MS);
      return () => clearTimeout(t);
    }, BLINK_INTERVAL_MS + Math.random() * 1500);
    return () => clearInterval(interval);
  }, []);

  if (!player) {
    return (
      <Card className="border-card-border">
        <CardContent className="flex flex-col items-center gap-3 pt-6 pb-5">
          <Skeleton className="h-36 w-36 rounded-full" />
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-2.5 w-full rounded-full" />
        </CardContent>
        {children && <CardContent className="pt-0 pb-5">{children}</CardContent>}
      </Card>
    );
  }

  const pct = Math.min(100, Math.round((player.xpIntoLevel / player.xpToNextLevel) * 100));
  const scene = backgroundScene && backgroundScene !== "auto" ? backgroundScene : sceneForStage(player.stage);
  const sceneSrc = BACKGROUND_SCENES[scene]?.src ?? BACKGROUND_SCENES.field.src;
  const activeImg = blinking ? companion.blinkImages[player.stage] : companion.images[player.stage];

  return (
    <Card className="border-card-border overflow-hidden">
      <div
        className="relative flex flex-col items-center gap-3 pt-6 pb-5 px-6"
        style={{
          backgroundImage: `url(${sceneSrc})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
      >
        <div className="absolute inset-0 bg-background/45 backdrop-blur-[1px]" aria-hidden="true" />
        <div
          className="absolute top-3 left-3 flex flex-col gap-1 rounded-xl bg-background/75 backdrop-blur px-2.5 py-1.5 shadow-sm"
          data-testid="hud-xp"
        >
          <span className="text-[11px] font-semibold leading-none">Lv. {player.level}</span>
          <Progress value={pct} className="h-1.5 w-16" data-testid="progress-xp" />
          <span className="text-[9px] text-muted-foreground leading-none">
            {player.xpIntoLevel}/{player.xpToNextLevel} XP
          </span>
        </div>
        {checkin && (
          <div
            className="absolute top-3 right-3 flex flex-col items-end gap-1 rounded-xl bg-background/75 backdrop-blur px-2.5 py-1.5 shadow-sm min-w-[84px]"
            data-testid="hud-health"
          >
            <span className="flex items-center gap-1 text-[10px] font-semibold leading-none">
              <Heart
                className={cn(
                  "h-3 w-3",
                  checkin.health <= 25 ? "text-destructive" : "text-rose-500",
                )}
                fill="currentColor"
              />
              Health
            </span>
            <Progress
              value={checkin.health}
              className={cn("h-1.5 w-16", checkin.health <= 25 && "[&>div]:bg-destructive")}
              data-testid="progress-health"
            />
            {checkin.streak > 0 && (
              <span className="flex items-center gap-0.5 text-[9px] text-muted-foreground leading-none">
                <Flame className="h-2.5 w-2.5 text-amber-500" />
                {checkin.streak} day streak
              </span>
            )}
            {typeof checkin.tasksCompletedToday === "number" && typeof checkin.dailyTaskGoal === "number" && (
              <span
                className="text-[9px] text-muted-foreground leading-none"
                data-testid="text-task-goal-progress"
              >
                {checkin.tasksCompletedToday}/{checkin.dailyTaskGoal} tasks today
              </span>
            )}
          </div>
        )}
        <AnimatedCompanion
          src={activeImg ?? stage1}
          alt={`${companion.name} the ${companion.species.toLowerCase()} companion, ${player.stageName} stage`}
          className="relative"
          imgClassName={cn(
            "h-36 w-36 object-contain drop-shadow-md select-none transition-all animate-dino-breathe motion-reduce:animate-none",
            checkin && checkin.health <= 25 && "saturate-[0.35] opacity-80",
            checkin && checkin.health > 25 && checkin.health <= 60 && "saturate-75",
            onImageClick && "cursor-pointer hover:scale-105 hover:drop-shadow-lg active:scale-95",
          )}
          testId="img-dino-companion"
          draggable={false}
          onClick={onImageClick}
          title={onImageClick ? "Tap to start a focus session" : undefined}
        />
        <div className="relative text-center">
          <p className="font-display font-semibold text-lg" data-testid="text-companion-level">
            {companion.name} · Lv. {player.level}
          </p>
          <p className="text-xs text-muted-foreground" data-testid="text-companion-stage">
            {player.stageName} · {player.levelRange}
          </p>
          {equippedItems && equippedItems.length > 0 && (
            <div className="flex items-center justify-center gap-1.5 mt-2" data-testid="row-equipped-items">
              {equippedItems.map((it) => (
                <span
                  key={it.slot}
                  title={it.name}
                  className="flex h-7 w-7 items-center justify-center rounded-full bg-background/85 backdrop-blur border border-card-border shadow-sm text-sm"
                  data-testid={`badge-equipped-${it.slot}`}
                >
                  {it.emoji}
                </span>
              ))}
            </div>
          )}
        </div>
        {children && <div className="relative w-full mt-1">{children}</div>}
      </div>
    </Card>
  );
}
