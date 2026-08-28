import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Layout } from "@/components/Layout";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { Repeat, Plus, Trash2, Clock } from "lucide-react";

interface RoutineItem {
  row: number;
  timeBlock: string;
  activity: string;
  days: string;
  type: string;
  notes: string;
  scheduledToday: boolean;
}

const DAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"];
const DAY_FULL = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DAY_KEY = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

/** Mirrors the server's parseDaysToSet for display purposes only. */
function parseDaysToIndices(days: string): number[] {
  const norm = (days || "").toLowerCase();
  if (!norm.trim() || /\bdaily\b|\bevery ?day\b/.test(norm)) return [0, 1, 2, 3, 4, 5, 6];
  if (/\bweekday/.test(norm)) return [1, 2, 3, 4, 5];
  if (/\bweekend/.test(norm)) return [0, 6];

  const rangeMatch = norm.match(/\b(sun|mon|tue|wed|thu|fri|sat)[a-z]*\s*(?:-|\u2013|\u2014|to)\s*(sun|mon|tue|wed|thu|fri|sat)[a-z]*\b/);
  if (rangeMatch) {
    const start = DAY_KEY.indexOf(rangeMatch[1]);
    const end = DAY_KEY.indexOf(rangeMatch[2]);
    if (start >= 0 && end >= 0) {
      const found: number[] = [];
      let i = start;
      while (true) {
        found.push(i);
        if (i === end) break;
        i = (i + 1) % 7;
      }
      return found;
    }
  }

  const found: number[] = [];
  DAY_KEY.forEach((key, idx) => {
    if (norm.includes(key)) found.push(idx);
  });
  return found.length > 0 ? found : [0, 1, 2, 3, 4, 5, 6];
}

function daysLabel(days: string): string {
  const indices = parseDaysToIndices(days);
  if (indices.length === 7) return "Every day";
  if (indices.length === 5 && [1, 2, 3, 4, 5].every((d) => indices.includes(d))) return "Weekdays";
  if (indices.length === 2 && [0, 6].every((d) => indices.includes(d))) return "Weekends";
  return indices.map((i) => DAY_FULL[i]).join(", ");
}

function DayPicker({ selected, onToggle }: { selected: number[]; onToggle: (i: number) => void }) {
  return (
    <div className="flex items-center gap-1.5">
      {DAY_LABELS.map((label, i) => {
        const active = selected.includes(i);
        return (
          <button
            key={i}
            type="button"
            onClick={() => onToggle(i)}
            data-testid={`button-day-${DAY_KEY[i]}`}
            className={cn(
              "h-9 w-9 rounded-full text-sm font-semibold border transition-colors shrink-0",
              active
                ? "bg-primary text-primary-foreground border-primary-border"
                : "bg-transparent text-muted-foreground border-border hover-elevate",
            )}
            aria-pressed={active}
            aria-label={DAY_FULL[i]}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

interface FormState {
  timeBlock: string;
  activity: string;
  category: string;
  notes: string;
  dayIndices: number[];
}

const EMPTY_FORM: FormState = { timeBlock: "", activity: "", category: "General", notes: "", dayIndices: [0, 1, 2, 3, 4, 5, 6] };

function RoutineForm({ form, setForm }: { form: FormState; setForm: (f: FormState) => void }) {
  const toggleDay = (i: number) => {
    setForm({
      ...form,
      dayIndices: form.dayIndices.includes(i)
        ? form.dayIndices.filter((d) => d !== i)
        : [...form.dayIndices, i].sort(),
    });
  };
  const presets: { label: string; indices: number[] }[] = [
    { label: "Every day", indices: [0, 1, 2, 3, 4, 5, 6] },
    { label: "Weekdays", indices: [1, 2, 3, 4, 5] },
    { label: "Weekends", indices: [0, 6] },
  ];
  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor="routine-activity">Activity</Label>
        <Textarea
          id="routine-activity"
          value={form.activity}
          onChange={(e) => setForm({ ...form, activity: e.target.value })}
          placeholder="Morning stretch, review inbox, take vitamins..."
          className="min-h-16"
          data-testid="input-routine-activity"
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label htmlFor="routine-time">Time</Label>
            <button
              type="button"
              onClick={() =>
                setForm({ ...form, timeBlock: form.timeBlock ? "" : "09:00" })
              }
              className={cn(
                "text-xs font-medium",
                !form.timeBlock ? "text-primary" : "text-muted-foreground hover:text-foreground",
              )}
              data-testid="button-routine-no-time"
            >
              {!form.timeBlock ? "Any time \u2713" : "Set a time \u2192"}
            </button>
          </div>
          {form.timeBlock ? (
            <Input
              id="routine-time"
              type="time"
              value={form.timeBlock}
              onChange={(e) => setForm({ ...form, timeBlock: e.target.value })}
              data-testid="input-routine-time"
            />
          ) : (
            <div className="h-9 flex items-center px-3 rounded-md border border-dashed border-border text-sm text-muted-foreground">
              No specific time — general habit
            </div>
          )}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="routine-category">Category</Label>
          <Input
            id="routine-category"
            value={form.category}
            onChange={(e) => setForm({ ...form, category: e.target.value })}
            placeholder="General"
            data-testid="input-routine-category"
          />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label>Repeats on</Label>
        <div className="flex items-center gap-1.5 flex-wrap mb-2">
          {presets.map((p) => (
            <Button
              key={p.label}
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setForm({ ...form, dayIndices: p.indices })}
              data-testid={`button-preset-${p.label.toLowerCase().replace(/\s/g, "-")}`}
            >
              {p.label}
            </Button>
          ))}
        </div>
        <DayPicker selected={form.dayIndices} onToggle={toggleDay} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="routine-notes">Notes (optional)</Label>
        <Textarea
          id="routine-notes"
          value={form.notes}
          onChange={(e) => setForm({ ...form, notes: e.target.value })}
          placeholder="Any extra detail..."
          className="min-h-16"
          data-testid="input-routine-notes"
        />
      </div>
    </div>
  );
}

export default function Routine() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data, isLoading, isError } = useQuery<RoutineItem[]>({ queryKey: ["/api/routines"] });

  const [addOpen, setAddOpen] = useState(false);
  const [addForm, setAddForm] = useState<FormState>(EMPTY_FORM);

  const [activeItem, setActiveItem] = useState<RoutineItem | null>(null);
  const [editForm, setEditForm] = useState<FormState>(EMPTY_FORM);

  const createRoutine = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/routines", {
        timeBlock: addForm.timeBlock,
        activity: addForm.activity.trim(),
        category: addForm.category.trim() || "General",
        notes: addForm.notes,
        dayIndices: addForm.dayIndices,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/routines"] });
      qc.invalidateQueries({ queryKey: ["/api/routine"] });
      setAddOpen(false);
      setAddForm(EMPTY_FORM);
      toast({ title: "Routine added" });
    },
    onError: (err: any) => {
      toast({ title: "Couldn't add routine", description: err?.message, variant: "destructive" });
    },
  });

  const saveRoutine = useMutation({
    mutationFn: async () => {
      if (!activeItem) return;
      await apiRequest("PATCH", `/api/routines/${activeItem.row}`, {
        timeBlock: editForm.timeBlock,
        activity: editForm.activity.trim(),
        category: editForm.category.trim() || "General",
        notes: editForm.notes,
        dayIndices: editForm.dayIndices,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/routines"] });
      qc.invalidateQueries({ queryKey: ["/api/routine"] });
      setActiveItem(null);
      toast({ title: "Routine saved" });
    },
    onError: (err: any) => {
      toast({ title: "Couldn't save routine", description: err?.message, variant: "destructive" });
    },
  });

  const deleteRoutine = useMutation({
    mutationFn: async () => {
      if (!activeItem) return;
      await apiRequest("DELETE", `/api/routines/${activeItem.row}`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/routines"] });
      qc.invalidateQueries({ queryKey: ["/api/routine"] });
      setActiveItem(null);
      toast({ title: "Routine deleted" });
    },
    onError: (err: any) => {
      toast({ title: "Couldn't delete routine", description: err?.message, variant: "destructive" });
    },
  });

  const openItem = (item: RoutineItem) => {
    setActiveItem(item);
    setEditForm({
      timeBlock: item.timeBlock ?? "",
      activity: item.activity ?? "",
      category: item.type ?? "General",
      notes: item.notes ?? "",
      dayIndices: parseDaysToIndices(item.days),
    });
  };

  const sorted = useMemo(() => {
    if (!data) return [];
    return [...data].sort((a, b) => {
      if (!a.timeBlock) return 1;
      if (!b.timeBlock) return -1;
      return a.timeBlock.localeCompare(b.timeBlock);
    });
  }, [data]);

  const hasAny = (data?.length ?? 0) > 0;

  return (
    <Layout title="Routine">
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-muted-foreground">Recurring habits & scheduled blocks</p>
        <Dialog open={addOpen} onOpenChange={(open) => {
          setAddOpen(open);
          if (open) setAddForm(EMPTY_FORM);
        }}>
          <DialogTrigger asChild>
            <Button size="icon" className="rounded-full shrink-0" data-testid="button-add-routine">
              <Plus className="h-4 w-4" />
            </Button>
          </DialogTrigger>
          <DialogContent data-testid="dialog-add-routine" className="max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Add a routine</DialogTitle>
            </DialogHeader>
            <RoutineForm form={addForm} setForm={setAddForm} />
            <DialogFooter>
              <Button
                onClick={() => createRoutine.mutate()}
                disabled={!addForm.activity.trim() || addForm.dayIndices.length === 0 || createRoutine.isPending}
                data-testid="button-save-new-routine"
              >
                Add routine
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading && (
        <div className="space-y-2">
          <Skeleton className="h-20 w-full rounded-lg" />
          <Skeleton className="h-20 w-full rounded-lg" />
        </div>
      )}

      {isError && (
        <Card className="border-card-border">
          <CardContent className="py-6 text-center text-sm text-muted-foreground">
            Couldn't load your routine right now.
          </CardContent>
        </Card>
      )}

      {!isLoading && !isError && !hasAny && (
        <Card className="border-card-border">
          <CardContent className="py-10 text-center">
            <Repeat className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">
              No routines yet — add your first recurring habit.
            </p>
          </CardContent>
        </Card>
      )}

      <Card className="border-card-border">
        <CardContent className="pt-0 pb-1 px-0 divide-y divide-border">
          {sorted.map((item) => (
            <button
              key={item.row}
              onClick={() => openItem(item)}
              className="w-full text-left py-3.5 px-4 hover-elevate rounded-md flex items-start gap-3"
              data-testid={`card-routine-${item.row}`}
            >
              <div className="flex-1 min-w-0">
                <p className="leading-snug font-medium">{item.activity}</p>
                <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                  {item.timeBlock ? (
                    <Badge variant="outline" className="gap-1">
                      <Clock className="h-3 w-3" />
                      {item.timeBlock}
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="gap-1 text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      Any time
                    </Badge>
                  )}
                  <Badge variant="secondary">{daysLabel(item.days)}</Badge>
                  {item.type && item.type !== "General" && <Badge variant="outline">{item.type}</Badge>}
                  {item.scheduledToday && (
                    <Badge className="bg-primary/15 text-primary border-primary/30" variant="outline">
                      Today
                    </Badge>
                  )}
                </div>
              </div>
            </button>
          ))}
        </CardContent>
      </Card>

      <Dialog open={!!activeItem} onOpenChange={(open) => !open && setActiveItem(null)}>
        <DialogContent data-testid="dialog-routine-detail" className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit routine</DialogTitle>
          </DialogHeader>
          <RoutineForm form={editForm} setForm={setEditForm} />
          <DialogFooter className="flex flex-row items-center justify-between gap-2">
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  className="text-destructive shrink-0"
                  data-testid="button-delete-routine"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent data-testid="dialog-delete-routine-confirm">
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete this routine?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This can't be undone. The routine will be permanently removed.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel data-testid="button-cancel-delete-routine">Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => deleteRoutine.mutate()}
                    disabled={deleteRoutine.isPending}
                    className="bg-destructive text-destructive-foreground hover-elevate"
                    data-testid="button-confirm-delete-routine"
                  >
                    Delete
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
            <Button
              onClick={() => saveRoutine.mutate()}
              disabled={saveRoutine.isPending || !editForm.activity.trim() || editForm.dayIndices.length === 0}
              data-testid="button-save-routine-detail"
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
