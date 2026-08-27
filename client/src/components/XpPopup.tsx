import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { Sparkles, Coins } from "lucide-react";
import { cn } from "@/lib/utils";

export interface XpAward {
  xpAwarded?: number;
  coinsAwarded?: number;
  leveledUp?: boolean;
  label?: string;
}

interface XpPopupContextValue {
  showXp: (award: XpAward | null | undefined) => void;
}

const XpPopupContext = createContext<XpPopupContextValue | null>(null);

/** Reads the app's XP/coin award response shape and shows a popup if it has anything worth celebrating. */
export function useXpPopup() {
  const ctx = useContext(XpPopupContext);
  if (!ctx) throw new Error("useXpPopup must be used within XpPopupProvider");
  return ctx;
}

export function XpPopupProvider({ children }: { children: ReactNode }) {
  const [active, setActive] = useState<(XpAward & { key: number }) | null>(null);

  const showXp = useCallback((award: XpAward | null | undefined) => {
    if (!award) return;
    const xp = award.xpAwarded ?? 0;
    const coins = award.coinsAwarded ?? 0;
    if (xp <= 0 && coins <= 0) return;
    setActive({ ...award, key: Date.now() });
  }, []);

  useEffect(() => {
    if (!active) return;
    const t = setTimeout(() => setActive(null), 2200);
    return () => clearTimeout(t);
  }, [active]);

  return (
    <XpPopupContext.Provider value={{ showXp }}>
      {children}
      {active && (
        <div
          className="fixed inset-x-0 top-16 z-50 flex justify-center px-4 pointer-events-none"
          data-testid="popup-xp"
        >
          <div
            key={active.key}
            className={cn(
              "xp-popup-enter flex items-center gap-3 rounded-2xl border border-primary/30 bg-card px-5 py-3 shadow-lg",
            )}
          >
            {active.leveledUp && (
              <span className="text-xs font-bold uppercase tracking-wide text-primary">Level up!</span>
            )}
            <div className="flex items-center gap-1.5 text-sm font-semibold text-primary">
              <Sparkles className="h-4 w-4" />
              <span data-testid="text-xp-amount">+{active.xpAwarded ?? 0} XP</span>
            </div>
            {(active.coinsAwarded ?? 0) > 0 && (
              <div className="flex items-center gap-1.5 text-sm font-semibold text-amber-500 dark:text-amber-400">
                <Coins className="h-4 w-4" />
                <span data-testid="text-coins-amount">+{active.coinsAwarded} coins</span>
              </div>
            )}
          </div>
        </div>
      )}
      <style>{`
        @keyframes xp-popup-in {
          0% { opacity: 0; transform: translateY(-8px) scale(0.94); }
          12% { opacity: 1; transform: translateY(0) scale(1); }
          82% { opacity: 1; transform: translateY(0) scale(1); }
          100% { opacity: 0; transform: translateY(-6px) scale(0.98); }
        }
        .xp-popup-enter { animation: xp-popup-in 2.2s ease forwards; }
      `}</style>
    </XpPopupContext.Provider>
  );
}
