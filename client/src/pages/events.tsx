import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Layout } from "@/components/Layout";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
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
import { CalendarDays, MapPin, ExternalLink, ChevronLeft, ChevronRight, Trash2, CalendarOff } from "lucide-react";
import {
  addDays,
  addMonths,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  startOfMonth,
  startOfWeek,
} from "date-fns";

interface EventRow {
  row: number;
  title: string;
  date: string;
  startTime: string;
  endTime: string;
  location: string;
  eventLink: string;
  source: string;
  dateAdded: string;
  eventId?: string;
  hasCalendarSync?: boolean;
}

function formatTime12h(t: string) {
  if (!t) return "";
  const [hStr, mStr] = t.split(":");
  let h = parseInt(hStr, 10);
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  return `${h}:${mStr} ${ampm}`;
}

function formatDateHeader(dateStr: string) {
  const today = new Date().toISOString().slice(0, 10);
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  if (dateStr === today) return "Today";
  if (dateStr === tomorrow) return "Tomorrow";
  try {
    const [y, m, d] = dateStr.split("-").map(Number);
    const dt = new Date(y, m - 1, d);
    return dt.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
  } catch {
    return dateStr;
  }
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function EventDetailRow({ e, onOpen }: { e: EventRow; onOpen: (e: EventRow) => void }) {
  return (
    <Card className="border-card-border" data-testid={`card-event-${e.row}`}>
      <CardContent
        className="py-3.5 flex items-start gap-3 cursor-pointer hover-elevate rounded-md"
        onClick={() => onOpen(e)}
      >
        <div className="rounded-md bg-primary/10 text-primary px-2 py-1 text-xs font-semibold shrink-0 min-w-[4.5rem] text-center">
          {formatTime12h(e.startTime)}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-medium leading-snug">{e.title}</p>
          {e.location && (
            <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
              <MapPin className="h-3 w-3" /> {e.location}
            </p>
          )}
        </div>
        {e.eventLink && (
          <a
            href={e.eventLink}
            target="_blank"
            rel="noreferrer"
            onClick={(evt) => evt.stopPropagation()}
            className="shrink-0 text-muted-foreground hover:text-primary"
            data-testid={`link-event-${e.row}`}
            aria-label="Open in Google Calendar"
          >
            <ExternalLink className="h-4 w-4" />
          </a>
        )}
      </CardContent>
    </Card>
  );
}

interface EventForm {
  title: string;
  date: string;
  startTime: string;
  endTime: string;
  location: string;
}

export default function Events() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data, isLoading, isError } = useQuery<EventRow[]>({ queryKey: ["/api/events"] });
  const [weekOffset, setWeekOffset] = useState(0);
  const [monthOffset, setMonthOffset] = useState(0);
  const [viewMode, setViewMode] = useState<"week" | "month">("week");
  const [selectedDay, setSelectedDay] = useState<string | null>(todayIso());

  const [activeEvent, setActiveEvent] = useState<EventRow | null>(null);
  const [form, setForm] = useState<EventForm>({ title: "", date: "", startTime: "", endTime: "", location: "" });

  const weekDays = useMemo(() => {
    const base = addDays(startOfWeek(new Date(), { weekStartsOn: 0 }), weekOffset * 7);
    return Array.from({ length: 7 }, (_, i) => addDays(base, i));
  }, [weekOffset]);

  const weekIsoSet = useMemo(() => new Set(weekDays.map((d) => format(d, "yyyy-MM-dd"))), [weekDays]);

  const changeWeek = (delta: number) => {
    setWeekOffset((w) => w + delta);
    setSelectedDay(null);
  };

  const monthDate = useMemo(() => addMonths(new Date(), monthOffset), [monthOffset]);

  const monthDays = useMemo(() => {
    const start = startOfWeek(startOfMonth(monthDate), { weekStartsOn: 0 });
    const end = endOfWeek(endOfMonth(monthDate), { weekStartsOn: 0 });
    const days: Date[] = [];
    let cur = start;
    while (cur <= end) {
      days.push(cur);
      cur = addDays(cur, 1);
    }
    return days;
  }, [monthDate]);

  const monthIsoSet = useMemo(() => new Set(monthDays.map((d) => format(d, "yyyy-MM-dd"))), [monthDays]);

  const changeMonth = (delta: number) => {
    setMonthOffset((m) => m + delta);
    setSelectedDay(null);
  };

  const visibleIsoSet = viewMode === "week" ? weekIsoSet : monthIsoSet;

  const eventsByDate = useMemo(() => {
    const map = new Map<string, EventRow[]>();
    for (const e of data ?? []) {
      if (!map.has(e.date)) map.set(e.date, []);
      map.get(e.date)!.push(e);
    }
    Array.from(map.values()).forEach((list) => list.sort((a, b) => a.startTime.localeCompare(b.startTime)));
    return map;
  }, [data]);

  const grouped = useMemo(() => {
    if (!data) return [];
    const today = todayIso();
    const upcoming = data
      .filter((e) => e.date >= today)
      .sort((a, b) => (a.date + a.startTime).localeCompare(b.date + b.startTime));
    const groups: { date: string; items: EventRow[] }[] = [];
    for (const e of upcoming) {
      const last = groups[groups.length - 1];
      if (last && last.date === e.date) last.items.push(e);
      else groups.push({ date: e.date, items: [e] });
    }
    return groups;
  }, [data]);

  const openEvent = (e: EventRow) => {
    setActiveEvent(e);
    setForm({
      title: e.title ?? "",
      date: e.date ?? "",
      startTime: e.startTime ?? "",
      endTime: e.endTime ?? "",
      location: e.location ?? "",
    });
  };

  const saveEvent = useMutation({
    mutationFn: async () => {
      if (!activeEvent) return { syncedToCalendar: false };
      const res = await apiRequest("PATCH", `/api/events/${activeEvent.row}`, form);
      return (await res.json()) as { syncedToCalendar?: boolean };
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["/api/events"] });
      qc.invalidateQueries({ queryKey: ["/api/today"] });
      setActiveEvent(null);
      if (data?.syncedToCalendar === false) {
        toast({
          title: "Event saved",
          description: "This event has no linked calendar entry, so Google Calendar wasn't updated.",
        });
      } else {
        toast({ title: "Event saved and synced to calendar" });
      }
    },
    onError: (err: any) => {
      toast({ title: "Couldn't save event", description: err?.message, variant: "destructive" });
    },
  });

  const deleteEvent = useMutation({
    mutationFn: async () => {
      if (!activeEvent) return { syncedToCalendar: false };
      const res = await apiRequest("DELETE", `/api/events/${activeEvent.row}`);
      return (await res.json()) as { syncedToCalendar?: boolean };
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["/api/events"] });
      qc.invalidateQueries({ queryKey: ["/api/today"] });
      setActiveEvent(null);
      if (data?.syncedToCalendar === false) {
        toast({
          title: "Event deleted",
          description: "No linked calendar entry was found, so Google Calendar wasn't touched.",
        });
      } else {
        toast({ title: "Event deleted from calendar" });
      }
    },
    onError: (err: any) => {
      toast({ title: "Couldn't delete event", description: err?.message, variant: "destructive" });
    },
  });

  const selectedItems = selectedDay && visibleIsoSet.has(selectedDay) ? (eventsByDate.get(selectedDay) ?? []) : [];
  const showDayPanel = !!selectedDay && visibleIsoSet.has(selectedDay);
  const weekLabel =
    weekDays.length > 0
      ? format(weekDays[0], "MMM") === format(weekDays[6], "MMM")
        ? format(weekDays[0], "MMMM yyyy")
        : `${format(weekDays[0], "MMM")} – ${format(weekDays[6], "MMM yyyy")}`
      : "";
  const monthLabel = format(monthDate, "MMMM yyyy");

  return (
    <Layout title="Events">
      <Card className="border-card-border mb-5">
        <CardContent className="py-3.5 space-y-3">
          <div className="flex items-center justify-center">
            <div className="flex items-center gap-0.5 rounded-lg bg-muted p-0.5" data-testid="toggle-view-mode">
              <button
                onClick={() => setViewMode("week")}
                className={cn(
                  "px-3 py-1 rounded-md text-xs font-medium transition-colors",
                  viewMode === "week" ? "bg-background shadow-sm" : "text-muted-foreground",
                )}
                data-testid="button-view-week"
              >
                Week
              </button>
              <button
                onClick={() => setViewMode("month")}
                className={cn(
                  "px-3 py-1 rounded-md text-xs font-medium transition-colors",
                  viewMode === "month" ? "bg-background shadow-sm" : "text-muted-foreground",
                )}
                data-testid="button-view-month"
              >
                Month
              </button>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => (viewMode === "week" ? changeWeek(-1) : changeMonth(-1))}
              data-testid={viewMode === "week" ? "button-week-prev" : "button-month-prev"}
              aria-label={viewMode === "week" ? "Previous week" : "Previous month"}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <p className="text-sm font-medium" data-testid={viewMode === "week" ? "text-week-label" : "text-month-label"}>
              {viewMode === "week" ? weekLabel : monthLabel}
            </p>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => (viewMode === "week" ? changeWeek(1) : changeMonth(1))}
              data-testid={viewMode === "week" ? "button-week-next" : "button-month-next"}
              aria-label={viewMode === "week" ? "Next week" : "Next month"}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>

          {viewMode === "week" ? (
            <div className="grid grid-cols-7 gap-1">
              {weekDays.map((d) => {
                const iso = format(d, "yyyy-MM-dd");
                const isToday = iso === todayIso();
                const isSelected = iso === selectedDay;
                const hasEvents = (eventsByDate.get(iso)?.length ?? 0) > 0;
                return (
                  <button
                    key={iso}
                    onClick={() => setSelectedDay(isSelected ? null : iso)}
                    className={cn(
                      "flex flex-col items-center gap-1 rounded-lg py-2 transition-colors",
                      isSelected ? "bg-primary text-primary-foreground" : "hover-elevate",
                    )}
                    data-testid={`button-weekday-${iso}`}
                  >
                    <span className={cn("text-[10px] uppercase tracking-wide", !isSelected && "text-muted-foreground")}>
                      {format(d, "EEE")}
                    </span>
                    <span
                      className={cn(
                        "text-sm font-semibold h-6 w-6 flex items-center justify-center rounded-full",
                        isToday && !isSelected && "border border-primary text-primary",
                      )}
                    >
                      {format(d, "d")}
                    </span>
                    <span
                      className={cn(
                        "h-1 w-1 rounded-full",
                        hasEvents ? (isSelected ? "bg-primary-foreground" : "bg-primary") : "bg-transparent",
                      )}
                    />
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="space-y-1">
              <div className="grid grid-cols-7 gap-1 text-center">
                {["S", "M", "T", "W", "T", "F", "S"].map((lbl, i) => (
                  <span key={i} className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    {lbl}
                  </span>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-1" data-testid="grid-month">
                {monthDays.map((d) => {
                  const iso = format(d, "yyyy-MM-dd");
                  const isToday = iso === todayIso();
                  const isSelected = iso === selectedDay;
                  const inMonth = isSameMonth(d, monthDate);
                  const hasEvents = (eventsByDate.get(iso)?.length ?? 0) > 0;
                  return (
                    <button
                      key={iso}
                      onClick={() => setSelectedDay(isSelected ? null : iso)}
                      className={cn(
                        "flex flex-col items-center gap-0.5 rounded-lg py-1.5 transition-colors",
                        isSelected ? "bg-primary text-primary-foreground" : "hover-elevate",
                        !inMonth && !isSelected && "opacity-35",
                      )}
                      data-testid={`button-monthday-${iso}`}
                    >
                      <span
                        className={cn(
                          "text-xs font-medium h-6 w-6 flex items-center justify-center rounded-full",
                          isToday && !isSelected && "border border-primary text-primary",
                        )}
                      >
                        {format(d, "d")}
                      </span>
                      <span
                        className={cn(
                          "h-1 w-1 rounded-full",
                          hasEvents ? (isSelected ? "bg-primary-foreground" : "bg-primary") : "bg-transparent",
                        )}
                      />
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {showDayPanel && (
            <div className="pt-2 border-t border-border space-y-2" data-testid="panel-day-detail">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                {formatDateHeader(selectedDay)}
              </p>
              {selectedItems.length === 0 ? (
                <p className="text-sm text-muted-foreground py-2">Nothing scheduled this day.</p>
              ) : (
                <div className="space-y-2">
                  {selectedItems.map((e) => (
                    <EventDetailRow key={e.row} e={e} onOpen={openEvent} />
                  ))}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">Upcoming</h2>

      {isLoading && (
        <div className="space-y-2">
          <Skeleton className="h-16 w-full rounded-lg" />
          <Skeleton className="h-16 w-full rounded-lg" />
        </div>
      )}

      {isError && (
        <Card className="border-card-border">
          <CardContent className="py-6 text-center text-sm text-muted-foreground">
            Couldn't load events right now.
          </CardContent>
        </Card>
      )}

      {!isLoading && grouped.length === 0 && (
        <Card className="border-card-border">
          <CardContent className="py-10 text-center">
            <CalendarDays className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">No upcoming events.</p>
          </CardContent>
        </Card>
      )}

      <div className="space-y-5">
        {grouped.map((group) => (
          <div key={group.date}>
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-2">
              {formatDateHeader(group.date)}
            </h3>
            <div className="space-y-2">
              {group.items.map((e) => (
                <EventDetailRow key={e.row} e={e} onOpen={openEvent} />
              ))}
            </div>
          </div>
        ))}
      </div>

      <Dialog open={!!activeEvent} onOpenChange={(open) => !open && setActiveEvent(null)}>
        <DialogContent data-testid="dialog-event-detail" className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit event</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="event-title">Title</Label>
              <Input
                id="event-title"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                data-testid="input-event-title"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="event-date">Date</Label>
              <Input
                id="event-date"
                type="date"
                value={form.date}
                onChange={(e) => setForm({ ...form, date: e.target.value })}
                data-testid="input-event-date"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="event-start">Start time</Label>
                <Input
                  id="event-start"
                  type="time"
                  value={form.startTime}
                  onChange={(e) => setForm({ ...form, startTime: e.target.value })}
                  data-testid="input-event-start"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="event-end">End time</Label>
                <Input
                  id="event-end"
                  type="time"
                  value={form.endTime}
                  onChange={(e) => setForm({ ...form, endTime: e.target.value })}
                  data-testid="input-event-end"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="event-location">Location</Label>
              <Input
                id="event-location"
                value={form.location}
                onChange={(e) => setForm({ ...form, location: e.target.value })}
                placeholder="Optional"
                data-testid="input-event-location"
              />
            </div>
            {activeEvent && activeEvent.hasCalendarSync === false && (
              <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                <CalendarOff className="h-3.5 w-3.5 shrink-0" />
                This event isn't linked to Google Calendar — changes only update this list.
              </p>
            )}
          </div>
          <DialogFooter className="flex flex-row items-center justify-between gap-2">
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  className="text-destructive shrink-0"
                  data-testid="button-delete-event"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent data-testid="dialog-delete-event-confirm">
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete this event?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This can't be undone. It will be removed from this list{activeEvent?.hasCalendarSync !== false ? " and from Google Calendar" : ""}.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel data-testid="button-cancel-delete-event">Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => deleteEvent.mutate()}
                    disabled={deleteEvent.isPending}
                    className="bg-destructive text-destructive-foreground hover-elevate"
                    data-testid="button-confirm-delete-event"
                  >
                    Delete
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
            <Button
              onClick={() => saveEvent.mutate()}
              disabled={saveEvent.isPending || !form.title.trim() || !form.date}
              data-testid="button-save-event-detail"
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
