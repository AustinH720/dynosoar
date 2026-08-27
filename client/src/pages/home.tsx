import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Layout } from "@/components/Layout";
import { DinoCompanion, type PlayerState } from "@/components/DinoCompanion";
import { Textarea } from "@/components/ui/textarea";
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
  const [text, setText] = useState("");
  const [lastResult, setLastResult] = useState<{ summary: string; type: string } | null>(null);
  const [levelUp, setLevelUp] = useState<{ level: number; stageChanged: boolean; stageName: string } | null>(null);
  const { toast } = useToast();
  const qc = useQueryClient();
  const { showXp } = useXpPopup();

  const [duplicateInfo, setDuplicateInfo] = useState<{ text: string; date: string; type: string } | null>(null);

  const today = useQuery<TodayResponse>({ queryKey: ["/api/today"] });
  const player = useQuery<PlayerState>({ queryKey: ["/api/player"] });
  const { data: settings } = useSettings();
  const routine = useQuery<RoutineItem[]>({ queryKey: ["/api/routine"] });

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
              {levelUp.stageChanged ? ` — Mossback evolved into a ${levelUp.stageName}!` : ""}
            </span>
          </div>
        )}

        <DinoCompanion player={player.data} backgroundScene={settings?.backgroundScene} />

        <Card className="border-card-border">
          <CardContent className="pt-5 pb-4 space-y-3">
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
              className="min-h-24 resize-none text-base border-none shadow-none px-0 focus-visible:ring-0"
              data-testid="input-capture"
              autoFocus
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
          </CardContent>
        </Card>

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

      {routine.data && routine.data.length > 0 && (
        <section className="mt-8 space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
            <ListChecks className="h-3.5 w-3.5" />
            Today's Routine
          </h2>
          <Card className="border-card-border">
            <CardContent className="py-2">
              {routine.data.map((item, idx) => (
                <div
                  key={item.row}
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
