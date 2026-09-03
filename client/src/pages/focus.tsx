import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Layout } from "@/components/Layout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useXpPopup } from "@/components/XpPopup";
import { COMPANION_REGISTRY, type CompanionId } from "@/data/companions";
import stage1 from "@/assets/dino/stage1.png";
import { cn } from "@/lib/utils";
import { Play, Pause, RotateCcw, Sparkles, Coffee } from "lucide-react";
import type { PlayerState } from "@/components/DinoCompanion";

interface FocusStateResponse {
  workMinutes: number;
  breakMinutes: number;
  sessionsToday: number;
}

interface FocusCompleteResponse {
  xp: { xpAwarded: number; coinsAwarded: number; leveledUp?: boolean };
  sessionsToday: number;
}

type Phase = "idle" | "work" | "break";

const BLINK_INTERVAL_MS = 4000;
const BLINK_DURATION_MS = 1400;

function formatTime(totalSeconds: number) {
  const s = Math.max(0, Math.ceil(totalSeconds));
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

export default function Focus() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { showXp } = useXpPopup();

  const focusState = useQuery<FocusStateResponse>({ queryKey: ["/api/focus"] });
  const player = useQuery<PlayerState>({ queryKey: ["/api/player"] });
  const companions = useQuery<{ activeCompanionId: CompanionId }>({ queryKey: ["/api/companions"] });

  const companionId = companions.data?.activeCompanionId ?? "mossback";
  const companion = COMPANION_REGISTRY[companionId] ?? COMPANION_REGISTRY.mossback;
  const stage = player.data?.stage ?? 1;

  const workMinutes = focusState.data?.workMinutes ?? 25;
  const breakMinutes = focusState.data?.breakMinutes ?? 5;
  const workSeconds = workMinutes * 60;
  const breakSeconds = breakMinutes * 60;

  const [phase, setPhase] = useState<Phase>("idle");
  const [running, setRunning] = useState(false);
  const [remaining, setRemaining] = useState(workSeconds);
  const [blinking, setBlinking] = useState(false);

  // Date-based timing so the countdown stays accurate even if the tab is
  // backgrounded/throttled — we always recompute from a target end time
  // instead of trusting cumulative setInterval ticks.
  const endAtRef = useRef<number | null>(null);
  const phaseTotalRef = useRef(workSeconds);

  useEffect(() => {
    if (phase === "idle") setRemaining(workSeconds);
  }, [workSeconds, phase]);

  useEffect(() => {
    const interval = setInterval(() => {
      setBlinking(true);
      const t = setTimeout(() => setBlinking(false), BLINK_DURATION_MS);
      return () => clearTimeout(t);
    }, BLINK_INTERVAL_MS + Math.random() * 1500);
    return () => clearInterval(interval);
  }, []);

  const completeMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/focus/complete", {});
      return (await res.json()) as FocusCompleteResponse;
    },
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ["/api/focus"] });
      qc.invalidateQueries({ queryKey: ["/api/player"] });
      qc.invalidateQueries({ queryKey: ["/api/checkin"] });
      qc.invalidateQueries({ queryKey: ["/api/skills"] });
      showXp({ xpAwarded: result.xp.xpAwarded, coinsAwarded: result.xp.coinsAwarded, leveledUp: result.xp.leveledUp });
      toast({ title: `Focus session complete! +${result.xp.xpAwarded} XP` });
    },
    onError: (err: any) => {
      toast({
        title: "Session finished, but the reward didn't save",
        description: err?.message || "Something went wrong logging your session.",
        variant: "destructive",
      });
    },
  });

  const startPhase = useCallback((nextPhase: "work" | "break") => {
    const total = nextPhase === "work" ? workSeconds : breakSeconds;
    phaseTotalRef.current = total;
    endAtRef.current = Date.now() + total * 1000;
    setPhase(nextPhase);
    setRemaining(total);
    setRunning(true);
  }, [workSeconds, breakSeconds]);

  // Tick loop: recompute remaining from the target end timestamp every
  // 250ms. On natural completion of the "work" phase, log it (awards XP +
  // counts toward the daily goal) and auto-advance to break; on natural
  // completion of "break", return to idle.
  useEffect(() => {
    if (!running || endAtRef.current == null) return;
    const tick = () => {
      if (endAtRef.current == null) return;
      const msLeft = endAtRef.current - Date.now();
      if (msLeft <= 0) {
        setRemaining(0);
        setRunning(false);
        if (phase === "work") {
          completeMutation.mutate();
          startPhase("break");
        } else if (phase === "break") {
          setPhase("idle");
          setRemaining(workSeconds);
          endAtRef.current = null;
        }
        return;
      }
      setRemaining(msLeft / 1000);
    };
    const id = setInterval(tick, 250);
    tick();
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, phase]);

  const handleStart = () => {
    if (phase === "idle") {
      startPhase("work");
    } else {
      // Resume from pause: recompute end time from current remaining.
      endAtRef.current = Date.now() + remaining * 1000;
      setRunning(true);
    }
  };

  const handlePause = () => {
    if (endAtRef.current != null) {
      setRemaining(Math.max(0, (endAtRef.current - Date.now()) / 1000));
    }
    setRunning(false);
  };

  const handleCancel = () => {
    setRunning(false);
    setPhase("idle");
    setRemaining(workSeconds);
    endAtRef.current = null;
  };

  const total = phase === "break" ? breakSeconds : workSeconds;
  const pct = total > 0 ? Math.min(100, Math.max(0, ((total - remaining) / total) * 100)) : 0;

  const activeImg = useMemo(() => {
    const images = blinking ? companion.blinkImages : companion.images;
    return images[stage] ?? stage1;
  }, [blinking, companion, stage]);

  const phaseLabel = phase === "work" ? "Focus time" : phase === "break" ? "Break time" : "Ready to focus?";
  const ringColor = phase === "break" ? "stroke-emerald-500" : "stroke-primary";

  const isLoading = focusState.isLoading || player.isLoading;

  return (
    <Layout title="Focus">
      {isLoading ? (
        <div className="flex flex-col items-center gap-4 pt-8">
          <Skeleton className="h-56 w-56 rounded-full" />
          <Skeleton className="h-6 w-40" />
        </div>
      ) : (
        <div className="flex flex-col items-center gap-5 pt-2 pb-4">
          <p className="text-sm text-muted-foreground text-center" data-testid="text-focus-phase">
            {phaseLabel}
          </p>

          <div className="relative h-64 w-64 flex items-center justify-center">
            <svg className="absolute inset-0 h-full w-full -rotate-90" viewBox="0 0 100 100" aria-hidden="true">
              <circle cx="50" cy="50" r="46" fill="none" strokeWidth="4" className="stroke-muted" />
              <circle
                cx="50"
                cy="50"
                r="46"
                fill="none"
                strokeWidth="4"
                strokeLinecap="round"
                className={cn("transition-[stroke-dashoffset] duration-300 ease-linear", ringColor)}
                strokeDasharray={2 * Math.PI * 46}
                strokeDashoffset={2 * Math.PI * 46 * (1 - pct / 100)}
              />
            </svg>
            <div className="flex flex-col items-center gap-2">
              <img
                src={activeImg}
                alt={`${companion.name} the ${companion.species.toLowerCase()} companion focusing`}
                className={cn(
                  "h-28 w-28 object-contain drop-shadow-md select-none transition-all",
                  running && "animate-dino-breathe motion-reduce:animate-none",
                )}
                data-testid="img-focus-companion"
                draggable={false}
              />
              <span className="font-display text-3xl font-semibold tabular-nums tracking-tight" data-testid="text-focus-timer">
                {formatTime(remaining)}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {phase === "idle" && (
              <Button size="lg" className="min-w-32" onClick={handleStart} data-testid="button-focus-start">
                <Play className="h-4 w-4" />
                Start focus
              </Button>
            )}
            {phase !== "idle" && running && (
              <Button size="lg" variant="secondary" className="min-w-32" onClick={handlePause} data-testid="button-focus-pause">
                <Pause className="h-4 w-4" />
                Pause
              </Button>
            )}
            {phase !== "idle" && !running && (
              <Button size="lg" className="min-w-32" onClick={handleStart} data-testid="button-focus-resume">
                <Play className="h-4 w-4" />
                Resume
              </Button>
            )}
            {phase !== "idle" && (
              <Button size="lg" variant="outline" onClick={handleCancel} data-testid="button-focus-cancel">
                <RotateCcw className="h-4 w-4" />
                Cancel
              </Button>
            )}
          </div>

          <Card className="w-full border-card-border">
            <CardContent className="flex items-center justify-between gap-3 py-3.5 px-4">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                {phase === "break" ? <Coffee className="h-4 w-4 text-emerald-500" /> : <Sparkles className="h-4 w-4 text-primary" />}
                <span>25 min focus / 5 min break</span>
              </div>
              <span className="text-sm font-semibold" data-testid="text-focus-sessions-today">
                {focusState.data?.sessionsToday ?? 0} session{(focusState.data?.sessionsToday ?? 0) === 1 ? "" : "s"} today
              </span>
            </CardContent>
          </Card>

          <p className="text-xs text-muted-foreground text-center max-w-xs">
            Finishing a full 25-minute session with {companion.name} earns XP and counts toward today's task goal.
          </p>
        </div>
      )}
    </Layout>
  );
}
