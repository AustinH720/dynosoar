import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Layout } from "@/components/Layout";
import { DinoCompanion, type PlayerState, type CheckinInfo, type EquippedItem } from "@/components/DinoCompanion";
import { COMPANION_REGISTRY, type CompanionId } from "@/data/companions";
import { Link, useLocation } from "wouter";
import { PawPrint, Heart, Mic, MicOff, Drumstick, X } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useSettings } from "@/hooks/use-settings";
import { useXpPopup } from "@/components/XpPopup";
import { cn } from "@/lib/utils";
import {
  CalendarDays,
  CheckSquare,
  NotebookPen,
  Repeat,
  Loader2,
  Send,
  MapPin,
  PartyPopper,
  Sparkles,
  ListChecks,
  Copy,
  CalendarX,
} from "lucide-react";

// Minimal type surface for the Web Speech API — not in default TS DOM libs.
interface SpeechRecognitionLike extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  onresult: ((event: any) => void) | null;
  onerror: ((event: any) => void) | null;
  onend: (() => void) | null;
}

function getSpeechRecognition(): (new () => SpeechRecognitionLike) | null {
  if (typeof window === "undefined") return null;
  const w = window as any;
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

// Splits a raw voice transcript into individual task-like items. Handles
// commas, "and", "and then", periods, and newlines as separators, then
// trims and drops fragments too short to be a real task.
function parseTranscript(transcript: string): string[] {
  return transcript
    .split(/,|\.|\n|\band then\b|\bthen\b|\band\b/gi)
    .map((s) => s.trim())
    .filter((s) => s.length > 2);
}

interface MyDayItem {
  row: number;
  task: string;
  status: string;
}

interface TodayResponse {
  today: string;
  events: { row: number; title: string; date: string; startTime: string; endTime: string; location: string }[];
  tasks: { row: number; task: string; category: string; dueDate: string; priority: string; status: string }[];
}

interface XpResult {
  xpAwarded: number;
  coinsAwarded?: number;
  leveledUp: boolean;
  stageChanged: boolean;
  player: PlayerState;
}

interface CaptureResponse {
  summary: string;
  type: string;
  matchedTask?: string | null;
  xp?: XpResult;
  duplicate?: boolean;
  match?: { text: string; date: string };
}

interface RoutineItem {
  row: number;
  timeBlock: string;
  activity: string;
  days: string;
  doneToday: boolean;
}

const TYPE_META: Record<string, { icon: any; label: string }> = {
  Event: { icon: CalendarDays, label: "Event" },
  Task: { icon: CheckSquare, label: "Task" },
  Note: { icon: NotebookPen, label: "Note" },
  Recurring: { icon: Repeat, label: "Recurring" },
  Completion: { icon: PartyPopper, label: "Completed" },
  Cancellation: { icon: CalendarX, label: "Cancelled" },
};

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

function formatTime12h(t: string) {
  if (!t) return "";
  const [hStr, mStr] = t.split(":");
  let h = parseInt(hStr, 10);
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  return `${h}:${mStr} ${ampm}`;
}

export default function Home() {
  const [, setLocation] = useLocation();
  const [text, setText] = useState("");
  const [lastResult, setLastResult] = useState<{ summary: string; type: string } | null>(null);
  const [levelUp, setLevelUp] = useState<{ level: number; stageChanged: boolean; stageName: string } | null>(null);
  const { toast } = useToast();
  const qc = useQueryClient();
  const { showXp } = useXpPopup();

  const [duplicateInfo, setDuplicateInfo] = useState<{ text: string; date: string; type: string } | null>(null);

  const today = useQuery<TodayResponse>({ queryKey: ["/api/today"] });
  const player = useQuery<PlayerState>({ queryKey: ["/api/player"] });
  const checkin = useQuery<CheckinInfo>({ queryKey: ["/api/checkin"] });
  const companions = useQuery<{ activeCompanionId: CompanionId }>({ queryKey: ["/api/companions"] });
  const equipped = useQuery<{ items: EquippedItem[] }>({ queryKey: ["/api/equipped"] });
  const { data: settings } = useSettings();
  const routine = useQuery<RoutineItem[]>({ queryKey: ["/api/routine"] });
  const myday = useQuery<{ items: MyDayItem[] }>({ queryKey: ["/api/myday"] });

  const [micOpen, setMicOpen] = useState(false);
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [draftItems, setDraftItems] = useState<string[]>([]);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const speechSupported = !!getSpeechRecognition();

  useEffect(() => {
    return () => {
      recognitionRef.current?.stop();
    };
  }, []);

  const resetMicDialog = () => {
    recognitionRef.current?.stop();
    setListening(false);
    setTranscript("");
    setDraftItems([]);
  };

  const startListening = () => {
    const Recognition = getSpeechRecognition();
    if (!Recognition) {
      toast({
        title: "Voice input isn't supported here",
        description: "Try Chrome or Edge for browser speech recognition.",
        variant: "destructive",
      });
      return;
    }
    const recognition = new Recognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = "en-US";
    recognition.onresult = (event: any) => {
      const text = Array.from(event.results as ArrayLike<any>)
        .map((r: any) => r[0].transcript)
        .join(" ");
      setTranscript(text);
      setDraftItems(parseTranscript(text));
    };
    recognition.onerror = () => {
      setListening(false);
      toast({
        title: "Couldn't hear that",
        description: "Check your microphone permission and try again.",
        variant: "destructive",
      });
    };
    recognition.onend = () => setListening(false);
    recognitionRef.current = recognition;
    setListening(true);
    recognition.start();
  };

  const stopListening = () => {
    recognitionRef.current?.stop();
    setListening(false);
  };

  const removeDraft = (idx: number) => {
    setDraftItems((items) => items.filter((_, i) => i !== idx));
  };

  const updateDraft = (idx: number, value: string) => {
    setDraftItems((items) => items.map((it, i) => (i === idx ? value : it)));
  };

  const confirmPlan = useMutation({
    mutationFn: async (items: string[]) => {
      const res = await apiRequest("POST", "/api/myday/plan", { items });
      return await res.json();
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["/api/myday"] });
      qc.invalidateQueries({ queryKey: ["/api/player"] });
      qc.invalidateQueries({ queryKey: ["/api/skills"] });
      setMicOpen(false);
      resetMicDialog();
      toast({ title: `Added ${data.created} item${data.created === 1 ? "" : "s"} to today's plan` });
    },
    onError: (err: any) => {
      toast({
        title: "Couldn't plan your day",
        description: err?.message || "Something went wrong. Try again.",
        variant: "destructive",
      });
    },
  });

  const capture = useMutation({
    mutationFn: async ({ entry, force }: { entry: string; force?: boolean }) => {
      const res = await apiRequest("POST", "/api/capture", { text: entry, force });
      return (await res.json()) as CaptureResponse;
    },
    onSuccess: (data) => {
      if (data.duplicate) {
        setDuplicateInfo({ text: data.match?.text ?? "", date: data.match?.date ?? "", type: data.type });
        return;
      }

      setLastResult({ summary: data.summary, type: data.type });
      setText("");
      qc.invalidateQueries({ queryKey: ["/api/today"] });
      qc.invalidateQueries({ queryKey: ["/api/tasks"] });
      qc.invalidateQueries({ queryKey: ["/api/events"] });
      qc.invalidateQueries({ queryKey: ["/api/notes"] });
      qc.invalidateQueries({ queryKey: ["/api/player"] });
      qc.invalidateQueries({ queryKey: ["/api/skills"] });
      qc.invalidateQueries({ queryKey: ["/api/shop"] });

      if (data.xp?.leveledUp) {
        setLevelUp({
          level: data.xp.player.level,
          stageChanged: data.xp.stageChanged,
          stageName: data.xp.player.stageName,
        });
      } else {
        setLevelUp(null);
        toast({ title: data.summary });
        showXp(data.xp);
      }
    },
    onError: (err: any) => {
      toast({
        title: "Couldn't save that",
        description: err?.message || "Something went wrong. Try again.",
        variant: "destructive",
      });
    },
  });

  const toggleTask = useMutation({
    mutationFn: async ({ row, status }: { row: number; status: string }) => {
      const res = await apiRequest("PATCH", `/api/tasks/${row}`, { status });
      return await res.json();
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["/api/today"] });
      qc.invalidateQueries({ queryKey: ["/api/tasks"] });
      qc.invalidateQueries({ queryKey: ["/api/myday"] });
      qc.invalidateQueries({ queryKey: ["/api/player"] });
      qc.invalidateQueries({ queryKey: ["/api/skills"] });
      qc.invalidateQueries({ queryKey: ["/api/shop"] });
      showXp(data?.xp);
    },
    onError: (err: any) => {
      toast({
        title: "Couldn't update that task",
        description: err?.message || "Something went wrong. Try again.",
        variant: "destructive",
      });
    },
  });

  const toggleRoutine = useMutation({
    mutationFn: async (item: RoutineItem) => {
      const res = await apiRequest("POST", `/api/routine/${item.row}/complete`, { activity: item.activity });
      return await res.json();
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["/api/routine"] });
      qc.invalidateQueries({ queryKey: ["/api/player"] });
      qc.invalidateQueries({ queryKey: ["/api/skills"] });
      qc.invalidateQueries({ queryKey: ["/api/shop"] });
      showXp(data.xp);
    },
  });

  const doCheckIn = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/checkin", {});
      return await res.json();
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["/api/checkin"] });
      if (data.alreadyCheckedIn) return;
      toast({ title: `Checked in! \ud83d\udd25 Streak: ${data.state?.streak ?? 1}` });
    },
    onError: (err: any) => {
      toast({
        title: "Couldn't check in",
        description: err?.message || "Something went wrong. Try again.",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = () => {
    const trimmed = text.trim();
    if (!trimmed || capture.isPending) return;
    capture.mutate({ entry: trimmed });
  };

  const ResultIcon = lastResult ? TYPE_META[lastResult.type]?.icon ?? NotebookPen : null;
  const hasToday = today.data && (today.data.events.length > 0 || today.data.tasks.length > 0);

  return (
    <Layout title="DynoSOAR">
      <section className="space-y-3">
        <p className="text-sm text-muted-foreground" data-testid="text-greeting">
          {greeting()}, Austin
        </p>

        {levelUp && (
          <div
            className="flex items-center gap-2.5 rounded-lg border border-primary/30 bg-primary/10 px-3.5 py-3 text-sm animate-in fade-in"
            data-testid="banner-level-up"
          >
            <PartyPopper className="h-4 w-4 text-primary shrink-0" />
            <span>
              Level up! {COMPANION_LEVEL_TEXT(levelUp.level)}
              {levelUp.stageChanged
                ? ` — ${COMPANION_REGISTRY[companions.data?.activeCompanionId ?? "mossback"].name} evolved into a ${levelUp.stageName}!`
                : ""}
            </span>
          </div>
        )}

        <DinoCompanion
          player={player.data}
          companionId={companions.data?.activeCompanionId}
          backgroundScene={settings?.backgroundScene}
          checkin={checkin.data}
          equippedItems={equipped.data?.items}
          onImageClick={() => setLocation("/focus")}
        >
          <div className="rounded-xl bg-card/90 backdrop-blur-sm border border-card-border px-4 pt-3 pb-3.5 space-y-3 shadow-sm">
            <Textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  handleSubmit();
                }
              }}
              placeholder="Add a task, add an event, or say “completed the CFA practice set”..."
              className="min-h-20 resize-none text-base border-none shadow-none px-0 focus-visible:ring-0 bg-transparent"
              data-testid="input-capture"
            />
            <Button
              className="w-full"
              size="lg"
              onClick={handleSubmit}
              disabled={!text.trim() || capture.isPending}
              data-testid="button-capture-submit"
            >
              {capture.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              Add to the Nest
            </Button>
          </div>
        </DinoCompanion>

        <div className="grid grid-cols-2 gap-2">
          <Button
            variant={checkin.data?.checkedInToday ? "secondary" : "default"}
            size="lg"
            disabled={checkin.data?.checkedInToday || doCheckIn.isPending}
            onClick={() => doCheckIn.mutate()}
            data-testid="button-checkin"
          >
            {doCheckIn.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Heart className="h-4 w-4" fill={checkin.data?.checkedInToday ? "currentColor" : "none"} />
            )}
            {checkin.data?.checkedInToday
              ? `Checked in ✓${checkin.data.streak > 1 ? ` · ${checkin.data.streak}d` : ""}`
              : "Check In"}
          </Button>
          <Button
            variant="outline"
            size="lg"
            onClick={() => setMicOpen(true)}
            data-testid="button-my-day"
          >
            <Mic className="h-4 w-4" />
            Plan My Day
          </Button>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Button variant="outline" size="lg" asChild data-testid="button-feed">
            <Link href="/feed">
              <Drumstick className="h-4 w-4" />
              Feed
            </Link>
          </Button>
          <Button variant="outline" size="lg" asChild data-testid="button-roster">
            <Link href="/companions">
              <PawPrint className="h-4 w-4" />
              Roster
            </Link>
          </Button>
        </div>

        {lastResult && ResultIcon && (
          <div
            className="flex items-center gap-2.5 rounded-lg border border-primary/20 bg-primary/5 px-3.5 py-3 text-sm"
            data-testid="text-last-result"
          >
            <ResultIcon className="h-4 w-4 text-primary shrink-0" />
            <span>{lastResult.summary}</span>
          </div>
        )}

      </section>

      <section className="mt-8 space-y-3">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
          <Sparkles className="h-3.5 w-3.5" />
          Today
        </h2>

        {today.isLoading && (
          <div className="space-y-2">
            <Skeleton className="h-16 w-full rounded-lg" />
            <Skeleton className="h-16 w-full rounded-lg" />
          </div>
        )}

        {today.isError && (
          <Card className="border-card-border">
            <CardContent className="py-4 text-sm text-muted-foreground">
              Couldn't load today's snapshot right now.
            </CardContent>
          </Card>
        )}

        {today.data && !hasToday && (
          <Card className="border-card-border">
            <CardContent className="py-6 text-center text-sm text-muted-foreground">
              Nothing on the schedule for today. Capture something above.
            </CardContent>
          </Card>
        )}

        {today.data?.events.map((e) => (
          <Card key={`ev-${e.row}`} className="border-card-border" data-testid={`card-today-event-${e.row}`}>
            <CardContent className="py-3 flex items-start gap-3">
              <div className="rounded-md bg-primary/10 text-primary px-2 py-1 text-xs font-semibold shrink-0 min-w-[4.5rem] text-center">
                {formatTime12h(e.startTime)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium leading-snug">{e.title}</p>
                {e.location && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                    <MapPin className="h-3 w-3" /> {e.location}
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        ))}

        {today.data?.tasks.map((t) => (
          <Card key={`tk-${t.row}`} className="border-card-border" data-testid={`card-today-task-${t.row}`}>
            <CardContent className="py-3 flex items-center gap-3">
              <Checkbox
                checked={t.status === "Completed"}
                onCheckedChange={(checked) =>
                  toggleTask.mutate({ row: t.row, status: checked ? "Completed" : "Not Started" })
                }
                disabled={toggleTask.isPending}
                data-testid={`checkbox-today-task-${t.row}`}
                className="shrink-0"
              />
              <p
                className={cn(
                  "flex-1 min-w-0 font-medium leading-snug",
                  t.status === "Completed" && "line-through text-muted-foreground",
                )}
              >
                {t.task}
              </p>
              {t.priority === "High" && (
                <Badge variant="destructive" className="shrink-0">
                  High
                </Badge>
              )}
            </CardContent>
          </Card>
        ))}
      </section>

      {((routine.data && routine.data.length > 0) || (myday.data && myday.data.items.length > 0)) && (
        <section className="mt-8 space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
            <ListChecks className="h-3.5 w-3.5" />
            Today's Plan
          </h2>
          <Card className="border-card-border">
            <CardContent className="py-2">
              {myday.data?.items.map((item, idx) => {
                const isLast =
                  idx === myday.data!.items.length - 1 && !(routine.data && routine.data.length > 0);
                return (
                  <div
                    key={`myday-${item.row}`}
                    className={cn("flex items-center gap-3 py-2.5", !isLast && "border-b border-border")}
                    data-testid={`row-myday-${item.row}`}
                  >
                    <Checkbox
                      checked={item.status === "Completed"}
                      onCheckedChange={(checked) =>
                        toggleTask.mutate({ row: item.row, status: checked ? "Completed" : "Not Started" })
                      }
                      disabled={toggleTask.isPending}
                      data-testid={`checkbox-myday-${item.row}`}
                      className="shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <p
                        className={cn(
                          "font-medium leading-snug",
                          item.status === "Completed" && "line-through text-muted-foreground",
                        )}
                      >
                        {item.task}
                      </p>
                      <p className="text-xs text-muted-foreground">Spoken plan</p>
                    </div>
                  </div>
                );
              })}
              {routine.data?.map((item, idx) => (
                <div
                  key={`routine-${item.row}`}
                  className={cn(
                    "flex items-center gap-3 py-2.5",
                    idx !== routine.data!.length - 1 && "border-b border-border",
                  )}
                  data-testid={`row-routine-${item.row}`}
                >
                  <Checkbox
                    checked={item.doneToday}
                    onCheckedChange={() => toggleRoutine.mutate(item)}
                    disabled={toggleRoutine.isPending}
                    data-testid={`checkbox-routine-${item.row}`}
                    className="shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <p
                      className={cn(
                        "font-medium leading-snug",
                        item.doneToday && "line-through text-muted-foreground",
                      )}
                    >
                      {item.activity}
                    </p>
                    <p className="text-xs text-muted-foreground">{item.days || item.timeBlock}</p>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </section>
      )}

      <Dialog
        open={micOpen}
        onOpenChange={(open) => {
          setMicOpen(open);
          if (!open) resetMicDialog();
        }}
      >
        <DialogContent data-testid="dialog-my-day">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Mic className="h-4 w-4 text-primary" />
              Plan My Day
            </DialogTitle>
            <DialogDescription>
              Tap the mic and talk through your day — "workout, finish the CFA readings, and then call the
              dentist" — I'll split it into a checklist that lands right in Today's Plan.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col items-center gap-3 py-2">
            <Button
              size="lg"
              className={cn(
                "h-16 w-16 rounded-full p-0 shadow-md",
                listening && "animate-pulse bg-destructive hover:bg-destructive",
              )}
              onClick={listening ? stopListening : startListening}
              data-testid="button-mic"
              aria-label={listening ? "Stop recording" : "Start recording"}
            >
              {listening ? <MicOff className="h-6 w-6" /> : <Mic className="h-6 w-6" />}
            </Button>
            <p className="text-xs text-muted-foreground">
              {listening
                ? "Listening… tap again to stop"
                : speechSupported
                  ? "Tap to speak"
                  : "Voice input works best in Chrome or Edge — type an item below instead"}
            </p>
            {transcript && (
              <p className="text-xs italic text-muted-foreground border-t border-border pt-2 mt-1 w-full text-center" data-testid="text-transcript">
                "{transcript}"
              </p>
            )}
          </div>

          {draftItems.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-semibold flex items-center gap-1.5">
                <Sparkles className="h-3.5 w-3.5" /> Review your plan
              </p>
              {draftItems.map((item, idx) => (
                <div key={idx} className="flex items-center gap-2" data-testid={`row-draft-${idx}`}>
                  <Input
                    value={item}
                    onChange={(e) => updateDraft(idx, e.target.value)}
                    className="flex-1"
                    data-testid={`input-draft-${idx}`}
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => removeDraft(idx)}
                    data-testid={`button-remove-draft-${idx}`}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}

          <DialogFooter>
            <Button
              className="w-full"
              disabled={draftItems.length === 0 || confirmPlan.isPending}
              onClick={() => confirmPlan.mutate(draftItems.filter((i) => i.trim()))}
              data-testid="button-confirm-plan"
            >
              {confirmPlan.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ListChecks className="h-4 w-4" />}
              Confirm & add to today's plan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!duplicateInfo} onOpenChange={(open) => !open && setDuplicateInfo(null)}>
        <DialogContent data-testid="dialog-duplicate">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Copy className="h-4 w-4 text-muted-foreground" />
              You've already had that thought
            </DialogTitle>
            <DialogDescription>
              This looks similar to something you captured{duplicateInfo?.date ? ` on ${duplicateInfo.date}` : ""}:
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-lg border border-border bg-muted/50 px-3.5 py-3 text-sm" data-testid="text-duplicate-match">
            {duplicateInfo?.text}
          </div>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              variant="outline"
              onClick={() => setDuplicateInfo(null)}
              data-testid="button-duplicate-cancel"
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                const trimmed = text.trim();
                setDuplicateInfo(null);
                if (trimmed) capture.mutate({ entry: trimmed, force: true });
              }}
              data-testid="button-duplicate-add-anyway"
            >
              Add anyway
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}

function COMPANION_LEVEL_TEXT(level: number) {
  return `Now level ${level}.`;
}
