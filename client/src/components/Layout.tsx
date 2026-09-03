import { Link, useLocation } from "wouter";
import type { ReactNode } from "react";
import { Logo } from "./Logo";
import { useTheme } from "@/lib/theme";
import { Button } from "@/components/ui/button";
import { Home as HomeIcon, CheckSquare, CalendarDays, NotebookPen, Sun, Moon, Settings as SettingsIcon, Store } from "lucide-react";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { path: "/", label: "Home", icon: HomeIcon, testId: "nav-home" },
  { path: "/tasks", label: "Tasks", icon: CheckSquare, testId: "nav-tasks" },
  { path: "/events", label: "Events", icon: CalendarDays, testId: "nav-events" },
  { path: "/notes", label: "Notes", icon: NotebookPen, testId: "nav-notes" },
];

export function Layout({ children, title }: { children: ReactNode; title: string }) {
  const [location] = useLocation();
  const { theme, toggle } = useTheme();

  return (
    <div className="min-h-dvh flex flex-col bg-background">
      <header className="sticky top-0 z-20 border-b border-border bg-background/95 backdrop-blur-sm">
        <div className="flex items-center justify-between px-4 py-3 max-w-lg mx-auto w-full">
          <div className="flex items-center gap-2.5">
            <Logo className="h-8 w-8 shrink-0" />
            <span className="font-display font-semibold text-lg tracking-tight" data-testid="text-app-title">
              {title}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="rounded-full"
              onClick={toggle}
              aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
              data-testid="button-theme-toggle"
            >
              {theme === "dark" ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
            </Button>
            <Link href="/shop">
              <Button
                variant="ghost"
                size="icon"
                className="rounded-full"
                aria-label="Shop"
                data-testid="button-shop"
              >
                <Store className="h-5 w-5" />
              </Button>
            </Link>
            <Link href="/settings">
              <Button
                variant="ghost"
                size="icon"
                className="rounded-full"
                aria-label="Settings"
                data-testid="button-settings"
              >
                <SettingsIcon className="h-5 w-5" />
              </Button>
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-lg mx-auto w-full px-4 pb-28 pt-4">{children}</main>

      <nav className="fixed bottom-0 left-0 right-0 z-20 border-t border-border bg-background/95 backdrop-blur-sm pb-[env(safe-area-inset-bottom)]">
        <div className="max-w-lg mx-auto grid grid-cols-4">
          {NAV_ITEMS.map((item) => {
            const active = location === item.path;
            const Icon = item.icon;
            return (
              <Link
                key={item.path}
                href={item.path}
                data-testid={item.testId}
                className={cn(
                  "flex flex-col items-center gap-1 py-2.5 text-[11px] leading-none font-medium transition-colors",
                  active ? "text-primary" : "text-muted-foreground",
                )}
              >
                <Icon className="h-5 w-5" strokeWidth={active ? 2.4 : 2} />
                <span className="text-center">{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
