import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSettings, useUpdateSettings } from "@/hooks/use-settings";
import { getQueryFn } from "@/lib/queryClient";
import { SCENE_ACCENTS, sceneForStage, type PlayerState } from "@/components/DinoCompanion";

export type ThemeMode = "Light" | "Dark" | "System";
type ResolvedTheme = "light" | "dark";

interface ThemeContextValue {
  theme: ResolvedTheme;
  mode: ThemeMode;
  /** Derived from the active background scene — see SCENE_ACCENTS. */
  accentColor: string;
  toggle: () => void;
  setMode: (mode: ThemeMode) => void;
}

export const ACCENT_COLORS: Record<string, { light: string; dark: string; label: string }> = {
  indigo: { label: "Indigo", light: "243 72% 58%", dark: "243 82% 68%" },
  teal: { label: "Teal", light: "189 75% 40%", dark: "189 80% 58%" },
  rose: { label: "Rose", light: "340 75% 52%", dark: "340 82% 65%" },
  amber: { label: "Amber", light: "38 88% 45%", dark: "38 90% 62%" },
  emerald: { label: "Emerald", light: "160 60% 38%", dark: "160 65% 52%" },
  violet: { label: "Violet", light: "262 65% 55%", dark: "262 75% 68%" },
};

const ThemeContext = createContext<ThemeContextValue>({
  theme: "light",
  mode: "System",
  accentColor: "indigo",
  toggle: () => {},
  setMode: () => {},
});

function getSystemPref(): ResolvedTheme {
  if (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches) {
    return "dark";
  }
  return "light";
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const { data: settings } = useSettings();
  const updateSettings = useUpdateSettings();
  // Same cache entry home.tsx/settings.tsx use for the companion — resolving
  // "auto" scene needs the current dino stage.
  const { data: player } = useQuery<PlayerState>({
    queryKey: ["/api/player"],
    queryFn: getQueryFn({ on401: "throw" }),
  });

  const [systemPref, setSystemPref] = useState<ResolvedTheme>(getSystemPref);
  // Local optimistic mode so the UI feels instant before the network round-trip resolves.
  const [localMode, setLocalMode] = useState<ThemeMode | null>(null);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => setSystemPref(getSystemPref());
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  const mode: ThemeMode = localMode ?? (settings?.themeMode as ThemeMode) ?? "System";

  // The accent always follows whichever background scene is currently on
  // screen — "Auto" resolves through the dino's stage, same as DinoCompanion.
  const rawScene = settings?.backgroundScene ?? "auto";
  const resolvedScene = rawScene !== "auto" ? rawScene : sceneForStage(player?.stage ?? 1);
  const accentColor = SCENE_ACCENTS[resolvedScene] ?? "indigo";

  const theme: ResolvedTheme = mode === "System" ? systemPref : mode === "Dark" ? "dark" : "light";

  useEffect(() => {
    const root = document.documentElement;
    if (theme === "dark") root.classList.add("dark");
    else root.classList.remove("dark");
  }, [theme]);

  useEffect(() => {
    const palette = ACCENT_COLORS[accentColor] ?? ACCENT_COLORS.indigo;
    const value = theme === "dark" ? palette.dark : palette.light;
    const root = document.documentElement.style;
    root.setProperty("--primary", value);
    root.setProperty("--ring", value);
    root.setProperty("--sidebar-primary", value);
    root.setProperty("--sidebar-ring", value);
    root.setProperty("--chart-1", value);
  }, [accentColor, theme]);

  const value = useMemo<ThemeContextValue>(
    () => ({
      theme,
      mode,
      accentColor,
      toggle: () => {
        const next: ThemeMode = theme === "dark" ? "Light" : "Dark";
        setLocalMode(next);
        updateSettings.mutate({ themeMode: next });
      },
      setMode: (next: ThemeMode) => {
        setLocalMode(next);
        updateSettings.mutate({ themeMode: next });
      },
    }),
    [theme, mode, accentColor, updateSettings],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext);
}
