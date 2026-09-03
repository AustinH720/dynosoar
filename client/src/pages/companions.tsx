import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Layout } from "@/components/Layout";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import { Lock, Check, Sparkles } from "lucide-react";
import {
  COMPANION_ORDER,
  COMPANION_REGISTRY,
  STAGE_NAMES,
  STAGE_LEVEL_RANGES,
  type CompanionId,
} from "@/data/companions";

interface CompanionApiMeta {
  id: CompanionId;
  name: string;
  species: string;
  unlockLevel: number;
  unlocked: boolean;
  stage: number;
  stageName: string;
}

interface CompanionsResponse {
  companions: CompanionApiMeta[];
  activeCompanionId: CompanionId;
  level: number;
  stage: number;
  stageName: string;
}

const ACCENT_CLASSES: Record<string, { ring: string; badge: string; tile: string }> = {
  emerald: {
    ring: "ring-emerald-500",
    badge: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30",
    tile: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  },
  teal: {
    ring: "ring-teal-500",
    badge: "bg-teal-500/15 text-teal-600 dark:text-teal-400 border-teal-500/30",
    tile: "bg-teal-500/15 text-teal-600 dark:text-teal-400",
  },
  slate: {
    ring: "ring-slate-500",
    badge: "bg-slate-500/15 text-slate-600 dark:text-slate-400 border-slate-500/30",
    tile: "bg-slate-500/15 text-slate-600 dark:text-slate-400",
  },
  violet: {
    ring: "ring-violet-500",
    badge: "bg-violet-500/15 text-violet-600 dark:text-violet-400 border-violet-500/30",
    tile: "bg-violet-500/15 text-violet-600 dark:text-violet-400",
  },
  cyan: {
    ring: "ring-cyan-500",
    badge: "bg-cyan-500/15 text-cyan-600 dark:text-cyan-400 border-cyan-500/30",
    tile: "bg-cyan-500/15 text-cyan-600 dark:text-cyan-400",
  },
};

function CompanionCard({
  meta,
  isActive,
  playerLevel,
  onSelect,
  pending,
}: {
  meta: CompanionApiMeta;
  isActive: boolean;
  playerLevel: number;
  onSelect: (id: CompanionId) => void;
  pending: boolean;
}) {
  const def = COMPANION_REGISTRY[meta.id];
  const accent = ACCENT_CLASSES[def.accent] ?? ACCENT_CLASSES.emerald;
  const locked = !meta.unlocked;
  const displayStage = locked ? 1 : meta.stage;
  const pct = locked ? Math.min(100, Math.round((playerLevel / def.unlockLevel) * 100)) : 100;

  return (
    <Card
      className={cn(
        "border-card-border overflow-hidden transition-all",
        locked && "opacity-70",
        isActive && `ring-2 ${accent.ring}`,
      )}
      data-testid={`card-companion-${meta.id}`}
    >
      <CardContent className="p-4 flex flex-col gap-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-3">
            <div
              className={cn(
                "relative flex h-16 w-16 shrink-0 items-center justify-center rounded-xl overflow-hidden",
                accent.tile,
              )}
              data-testid={`img-tile-companion-${meta.id}`}
            >
              <img
                src={def.images[displayStage]}
                alt={`${def.name} the ${def.species}`}
                className={cn("h-14 w-14 object-contain select-none", locked && "grayscale opacity-60")}
                draggable={false}
              />
              {locked && (
                <div className="absolute inset-0 flex items-center justify-center bg-background/40">
                  <Lock className="h-5 w-5 text-foreground/70" />
                </div>
              )}
            </div>
            <div>
              <div className="flex items-center gap-1.5 flex-wrap">
                <p className="font-display font-semibold text-sm leading-snug">{def.name}</p>
                {isActive && (
                  <Badge className={cn("gap-1 shrink-0 text-[10px] py-0", accent.badge)} variant="outline">
                    <Sparkles className="h-2.5 w-2.5" /> Active
                  </Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">{def.species}</p>
              <p className="text-xs text-muted-foreground mt-1">{def.tagline}</p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1.5 flex-wrap">
          <Badge variant="secondary">
            {locked ? `Unlocks at Lv. ${def.unlockLevel}` : `${meta.stageName} · ${STAGE_LEVEL_RANGES[displayStage]}`}
          </Badge>
        </div>

        {locked ? (
          <div>
            <div className="flex items-center justify-between text-[11px] text-muted-foreground mb-1">
              <span>
                Lv. {playerLevel} / {def.unlockLevel}
              </span>
              <span>{Math.max(0, def.unlockLevel - playerLevel)} to go</span>
            </div>
            <Progress value={pct} className="h-1.5" />
          </div>
        ) : (
          <Button
            size="sm"
            variant={isActive ? "secondary" : "outline"}
            className="gap-1.5 self-start"
            disabled={isActive || pending}
            onClick={() => onSelect(meta.id)}
            data-testid={`button-select-companion-${meta.id}`}
          >
            {isActive ? (
              <>
                <Check className="h-3.5 w-3.5" /> Selected
              </>
            ) : (
              "Set as active"
            )}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

export default function Companions() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data, isLoading, isError } = useQuery<CompanionsResponse>({ queryKey: ["/api/companions"] });

  const select = useMutation({
    mutationFn: async (id: CompanionId) => {
      const res = await apiRequest("POST", "/api/companions/active", { id });
      return await res.json();
    },
    onSuccess: (result: { activeCompanionId: CompanionId }) => {
      qc.invalidateQueries({ queryKey: ["/api/companions"] });
      toast({ title: `${COMPANION_REGISTRY[result.activeCompanionId].name} is now your active companion!` });
    },
    onError: (err: any) => {
      toast({ title: "Couldn't switch companion", description: err?.message, variant: "destructive" });
    },
  });

  const orderedMeta = data
    ? COMPANION_ORDER.map((id) => data.companions.find((c) => c.id === id)).filter(
        (c): c is CompanionApiMeta => Boolean(c),
      )
    : [];

  return (
    <Layout title="Companions">
      {isLoading && (
        <div className="space-y-3">
          <Skeleton className="h-24 w-full rounded-lg" />
          <Skeleton className="h-28 w-full rounded-lg" />
          <Skeleton className="h-28 w-full rounded-lg" />
        </div>
      )}

      {isError && (
        <Card className="border-card-border">
          <CardContent className="py-6 text-center text-sm text-muted-foreground">
            Couldn't load your companion roster. Pull to refresh in a moment.
          </CardContent>
        </Card>
      )}

      {data && (
        <>
          <Card className="border-card-border mb-4">
            <CardContent className="p-4 space-y-1">
              <p className="text-sm font-medium text-muted-foreground">Your level path</p>
              <p className="font-display font-semibold text-lg" data-testid="text-companions-level">
                Lv. {data.level} · {data.stageName}
              </p>
              <p className="text-xs text-muted-foreground">
                Every companion evolves together with you — unlocking a new one just adds it to your roster at
                your current stage. Pick any unlocked companion to make it your active dino.
              </p>
            </CardContent>
          </Card>

          <div className="space-y-3">
            {orderedMeta.map((meta) => (
              <CompanionCard
                key={meta.id}
                meta={meta}
                isActive={meta.id === data.activeCompanionId}
                playerLevel={data.level}
                onSelect={(id) => select.mutate(id)}
                pending={select.isPending}
              />
            ))}
          </div>
        </>
      )}
    </Layout>
  );
}
