// client/src/components/FocusTimer.tsx
//
// Focus timer: quick-start Pomodoro presets (25/5, 50/10) plus a fully
// custom duration. Runs client-side (setInterval countdown); only talks to
// the server once, when a session ENDS, to log it and award XP — no
// server round-trips during the countdown itself.
//
// XP model (see shared/focusXp.ts for the pure, tested calculation):
//   - Flat XP per minute, not per session, so a 10-minute and 50-minute
//     session both feel proportionally fair.
//   - Ending early still awards XP for elapsed time (no punishment for
//     stopping), but the full-session bonus (see focusXp.ts) only applies
//     if the session actually completed — so there's no incentive to
//     start-then-immediately-cancel repeatedly to farm XP.
//   - A bonus applies if a linked task is marked complete within the same
//     session (encourages actually finishing the thing you sat down for).

import { useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { apiRequest } from "@/lib/queryClient";
import { useXpPopup, type XpAward } from "@/components/XpPopup";
import { useToast } from "@/hooks/use-toast";
import { Play, Pause, Square, Timer as TimerIcon } from "lucide-react";

const PRESETS = [
  { label: "25 / 5", focusMinutes: 25 },
  { label: "50 / 10", focusMinutes: 50 },
] as const;

interface FocusTimerProps {
  /** Optional linked task — if provided, completing it during the session earns the bonus. */
  taskRow?: number;
  taskLabel?: string;
  onClose?: () => void;
}

type Phase = "idle" | "running" | "paused" | "complete";

export function FocusTimer({ taskRow, taskLabel, onClose }: FocusTimerProps) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [totalSeconds, setTotalSeconds] = useState(25 * 60);
  const [remainingSeconds, setRemainingSeconds] = useState(25 * 60);
  const [customMinutes, setCustomMinutes] = useState("25");
  const [pauseUsed, setPauseUsed] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const qc = useQueryClient();
  const { showXp } = useXpPopup();
  const { toast } = useToast();

  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  const logSession = useMutation({
    mutationFn: async (payload: { durationMinutes: number; completed: boolean; taskRow?: number }) => {
      const res = await apiRequest("POST", "/api/focus/complete", payload);
      return res.json() as Promise<{ ok: boolean; xp?: XpAward | null }>;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["/api/player"] });
      qc.invalidateQueries({ queryKey: ["/api/skills"] });
      if (data?.xp) showXp(data.xp);
    },
    onError: (err: any) => {
      toast({ title: "Couldn't log focus session", description: err?.message, variant: "destructive" });
    },
  });

  function start(minutes: number) {
    const secs = minutes * 60;
    setTotalSeconds(secs);
    setRemainingSeconds(secs);
    setPauseUsed(false);
    setPhase("running");
    intervalRef.current = setInterval(() => {
      setRemainingSeconds((prev) => {
        if (prev <= 1) {
          if (intervalRef.current) clearInterval(intervalRef.current);
          setPhase("complete");
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }

  function pause() {
    if (phase !== "running" || pauseUsed) return;
    if (intervalRef.current) clearInterval(intervalRef.current);
    setPauseUsed(true);
    setPhase("paused");
  }

  function resume() {
    if (phase !== "paused") return;
    setPhase("running");
    intervalRef.current = setInterval(() => {
      setRemainingSeconds((prev) => {
        if (prev <= 1) {
          if (intervalRef.current) clearInterval(intervalRef.current);
          setPhase("complete");
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }

  function endEarly() {
    if (intervalRef.current) clearInterval(intervalRef.current);
    const elapsedSeconds = totalSeconds - remainingSeconds;
    const elapsedMinutes = Math.max(1, Math.round(elapsedSeconds / 60));
    setPhase("complete");
    logSession.mutate({ durationMinutes: elapsedMinutes, completed: false, taskRow });
  }

  // Auto-log once the countdown naturally reaches zero.
  useEffect(() => {
    if (phase === "complete" && remainingSeconds === 0 && totalSeconds > 0) {
      const fullMinutes = Math.round(totalSeconds / 60);
      logSession.mutate({ durationMinutes: fullMinutes, completed: true, taskRow });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  const mm = String(Math.floor(remainingSeconds / 60)).padStart(2, "0");
  const ss = String(remainingSeconds % 60).padStart(2, "0");
  const pct = totalSeconds > 0 ? Math.round(((totalSeconds - remainingSeconds) / totalSeconds) * 100) : 0;

  return (
    <Card className="border-card-border" data-testid="card-focus-timer">
      <CardContent className="py-5 space-y-4">
        {taskLabel && (
          <p className="text-xs text-muted-foreground text-center truncate">Focusing on: {taskLabel}</p>
        )}

        {phase === "idle" && (
          <>
            <div className="flex gap-2 justify-center">
              {PRESETS.map((p) => (
                <Button
                  key={p.label}
                  variant="outline"
                  onClick={() => start(p.focusMinutes)}
                  data-testid={`button-preset-${p.focusMinutes}`}
                >
                  {p.label}
                </Button>
              ))}
            </div>
            <div className="flex items-center gap-2 justify-center">
              <input
                type="number"
                min={1}
                max={180}
                value={customMinutes}
                onChange={(e) => setCustomMinutes(e.target.value)}
                className="w-16 h-9 rounded-md border border-input bg-transparent px-2 text-sm text-center"
                data-testid="input-custom-minutes"
                aria-label="Custom duration in minutes"
              />
              <span className="text-sm text-muted-foreground">min</span>
              <Button
                size="sm"
                onClick={() => {
                  const m = Math.max(1, Math.min(180, parseInt(customMinutes, 10) || 25));
                  start(m);
                }}
                data-testid="button-start-custom"
              >
                <Play className="h-3.5 w-3.5 mr-1" />
                Start
              </Button>
            </div>
          </>
        )}

        {(phase === "running" || phase === "paused") && (
          <>
            <div className="text-center">
              <p className="text-4xl font-display font-semibold tabular-nums" data-testid="text-timer-remaining">
                {mm}:{ss}
              </p>
              <div className="h-1.5 bg-muted rounded-full mt-3 overflow-hidden">
                <div className="h-full bg-primary transition-all" style={{ width: `${pct}%` }} />
              </div>
            </div>
            <div className="flex gap-2 justify-center">
              {phase === "running" ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={pause}
                  disabled={pauseUsed}
                  data-testid="button-pause"
                  title={pauseUsed ? "Already paused once this session" : "Pause"}
                >
                  <Pause className="h-3.5 w-3.5 mr-1" />
                  Pause
                </Button>
              ) : (
                <Button variant="outline" size="sm" onClick={resume} data-testid="button-resume">
                  <Play className="h-3.5 w-3.5 mr-1" />
                  Resume
                </Button>
              )}
              <Button variant="ghost" size="sm" onClick={endEarly} data-testid="button-end-early">
                <Square className="h-3.5 w-3.5 mr-1" />
                End session
              </Button>
            </div>
          </>
        )}

        {phase === "complete" && (
          <div className="text-center space-y-3">
            <TimerIcon className="h-6 w-6 mx-auto text-primary" />
            <p className="text-sm font-medium">Session logged</p>
            <Button size="sm" variant="outline" onClick={onClose} data-testid="button-focus-done">
              Done
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
