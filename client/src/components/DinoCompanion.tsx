import { useEffect, useState, type ReactNode } from "react";
import stage1 from "@/assets/dino/stage1.png";
import stage2 from "@/assets/dino/stage2.png";
import stage3 from "@/assets/dino/stage3.png";
import stage4 from "@/assets/dino/stage4.png";
import stage5 from "@/assets/dino/stage5.png";
import stage1Blink from "@/assets/dino/stage1_blink.png";
import stage2Blink from "@/assets/dino/stage2_blink.png";
import stage3Blink from "@/assets/dino/stage3_blink.png";
import stage4Blink from "@/assets/dino/stage4_blink.png";
import stage5Blink from "@/assets/dino/stage5_blink.png";
import fieldBg from "@/assets/backgrounds/field.jpg";
import forestBg from "@/assets/backgrounds/forest.jpg";
import beachBg from "@/assets/backgrounds/beach.jpg";
import volcanoBg from "@/assets/backgrounds/volcano.jpg";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Drumstick, Frown } from "lucide-react";
import { cn } from "@/lib/utils";

export interface HungerInfo {
  level: "fed" | "peckish" | "hungry";
  daysSinceActivity: number | null;
  message: string;
}

export interface PlayerState {
  level: number;
  xpIntoLevel: number;
  xpToNextLevel: number;
  totalXp: number;
  stage: number;
  stageName: string;
  levelRange: string;
  coins?: number;
  hunger?: HungerInfo;
}

export interface EquippedItem {
  slot: string;
  name: string;
  emoji: string;
  skill: string;
}

const STAGE_IMAGES: Record<number, string> = {
  1: stage1,
  2: stage2,
  3: stage3,
  4: stage4,
  5: stage5,
};

const STAGE_BLINK_IMAGES: Record<number, string> = {
  1: stage1Blink,
  2: stage2Blink,
  3: stage3Blink,
  4: stage4Blink,
  5: stage5Blink,
};

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

const COMPANION_NAME = "Mossback";
const BLINK_INTERVAL_MS = 4000;
const BLINK_DURATION_MS = 1400;

export function DinoCompanion({
  player,
  backgroundScene,
  equippedItems,
  children,
}: {
  player?: PlayerState;
  backgroundScene?: string;
  equippedItems?: EquippedItem[];
  children?: ReactNode;
}) {
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
  const activeImg = blinking ? STAGE_BLINK_IMAGES[player.stage] : STAGE_IMAGES[player.stage];

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
        {player.hunger && player.hunger.level !== "fed" && (
          <Badge
            variant="outline"
            className={cn(
              "absolute top-3 right-3 gap-1 shadow-sm",
              player.hunger.level === "hungry"
                ? "border-destructive bg-destructive text-destructive-foreground"
                : "border-amber-600 bg-amber-500 text-white",
            )}
            data-testid="badge-hunger"
          >
            {player.hunger.level === "hungry" ? (
              <Frown className="h-3 w-3" />
            ) : (
              <Drumstick className="h-3 w-3" />
            )}
            {player.hunger.level === "hungry" ? "Hungry" : "Peckish"}
          </Badge>
        )}
        <img
          src={activeImg ?? stage1}
          alt={`${COMPANION_NAME} the dinosaur companion, ${player.stageName} stage`}
          className={cn(
            "relative h-36 w-36 object-contain drop-shadow-md select-none transition-all animate-dino-breathe motion-reduce:animate-none",
            player.hunger?.level === "hungry" && "saturate-[0.35] opacity-80",
            player.hunger?.level === "peckish" && "saturate-75",
          )}
          data-testid="img-dino-companion"
          draggable={false}
        />
        <div className="relative text-center">
          <p className="font-display font-semibold text-lg" data-testid="text-companion-level">
            {COMPANION_NAME} · Lv. {player.level}
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
          {player.hunger && player.hunger.level !== "fed" && (
            <p
              className={cn(
                "text-xs mt-1.5 inline-block rounded-full px-2.5 py-0.5 font-medium",
                player.hunger.level === "hungry"
                  ? "bg-destructive text-destructive-foreground"
                  : "bg-amber-500 text-white",
              )}
              data-testid="text-hunger-message"
            >
              {player.hunger.message}
            </p>
          )}
        </div>
        {children && <div className="relative w-full mt-1">{children}</div>}
      </div>
    </Card>
  );
}
