import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Layout } from "@/components/Layout";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { CalendarDays, MapPin, ExternalLink, ChevronLeft, ChevronRight } from "lucide-react";
import { addDays, format, startOfWeek } from "date-fns";

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

function EventDetailRow({ e }: { e: EventRow }) {
  return (
    <Card className="border-card-border" data-testid={`card-event-${e.row}`}>
      <CardContent className="py-3.5 flex items-start gap-3">
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

export default function Events() {
  const { data, isLoading, isError } = useQuery<EventRow[]>({ queryKey: ["/api/events"] });
  const [weekOffset, setWeekOffset] = useState(0);
  const [selectedDay, setSelectedDay] = useState<string | null>(todayIso());

  const weekDays = useMemo(() => {
    const base = addDays(startOfWeek(new Date(), { weekStartsOn: 0 }), weekOffset * 7);
    return Array.from({ length: 7 }, (_, i) => addDays(base, i));
  }, [weekOffset]);

  const weekIsoSet = useMemo(() => new Set(weekDays.map((d) => format(d, "yyyy-MM-dd"))), [weekDays]);

  const changeWeek = (delta: number) => {
    setWeekOffset((w) => w + delta);
    setSelectedDay(null);
  };

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

  const selectedItems = selectedDay && weekIsoSet.has(selectedDay) ? (eventsByDate.get(selectedDay) ?? []) : [];
  const showDayPanel = !!selectedDay && weekIsoSet.has(selectedDay);
  const weekLabel =
    weekDays.length > 0
      ? format(weekDays[0], "MMM") === format(weekDays[6], "MMM")
        ? format(weekDays[0], "MMMM yyyy")
        : `${format(weekDays[0], "MMM")} – ${format(weekDays[6], "MMM yyyy")}`
      : "";

  return (
    <Layout title="Events">
      <Card className="border-card-border mb-5">
        <CardContent className="py-3.5 space-y-3">
          <div className="flex items-center justify-between">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => changeWeek(-1)}
              data-testid="button-week-prev"
              aria-label="Previous week"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <p className="text-sm font-medium" data-testid="text-week-label">
              {weekLabel}
            </p>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => changeWeek(1)}
              data-testid="button-week-next"
              aria-label="Next week"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>

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
                    <EventDetailRow key={e.row} e={e} />
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
                <EventDetailRow key={e.row} e={e} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </Layout>
  );
}
