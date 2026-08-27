import { Layout } from "@/components/Layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useTheme, ACCENT_COLORS, type ThemeMode } from "@/lib/theme";
import { useSettings, useUpdateSettings } from "@/hooks/use-settings";
import { BACKGROUND_SCENES, SCENE_ACCENTS, sceneForStage } from "@/components/DinoCompanion";
import { useQuery } from "@tanstack/react-query";
import { getQueryFn } from "@/lib/queryClient";
import type { PlayerState } from "@/components/DinoCompanion";
import { cn } from "@/lib/utils";
import { Check, Sparkles } from "lucide-react";

const MODE_OPTIONS: { value: ThemeMode; label: string }[] = [
  { value: "Light", label: "Light" },
  { value: "Dark", label: "Dark" },
  { value: "System", label: "System" },
];

export default function Settings() {
  const { mode, setMode } = useTheme();
  const { data: settings, isLoading } = useSettings();
  const updateSettings = useUpdateSettings();
  const { data: player } = useQuery<PlayerState>({
    queryKey: ["/api/player"],
    queryFn: getQueryFn({ on401: "throw" }),
  });

  const backgroundScene = settings?.backgroundScene ?? "field";
  const autoScene = player ? sceneForStage(player.stage) : "field";

  return (
    <Layout title="Settings">
      <div className="space-y-5">
        <Card className="border-card-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-display">Theme Mode</CardTitle>
          </CardHeader>
          <CardContent>
            <RadioGroup
              value={mode}
              onValueChange={(v) => setMode(v as ThemeMode)}
              className="grid grid-cols-3 gap-2"
              data-testid="radiogroup-theme-mode"
            >
              {MODE_OPTIONS.map((opt) => (
                <Label
                  key={opt.value}
                  htmlFor={`mode-${opt.value}`}
                  className={cn(
                    "flex items-center justify-center gap-2 rounded-lg border border-border px-3 py-2.5 text-sm font-medium cursor-pointer transition-colors",
                    mode === opt.value
                      ? "border-primary bg-primary/10 text-primary"
                      : "text-muted-foreground hover-elevate",
                  )}
                  data-testid={`label-mode-${opt.value.toLowerCase()}`}
                >
                  <RadioGroupItem value={opt.value} id={`mode-${opt.value}`} className="sr-only" />
                  {opt.label}
                </Label>
              ))}
            </RadioGroup>
          </CardContent>
        </Card>

        <Card className="border-card-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-display">Background Scene</CardTitle>
            <p className="text-xs text-muted-foreground">
              The accent color follows whichever scene is active — pick a scene below and the
              app's highlight color updates to match automatically.
            </p>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="grid grid-cols-3 gap-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="aspect-square rounded-lg" />
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-3">
                <button
                  type="button"
                  onClick={() => updateSettings.mutate({ backgroundScene: "auto" })}
                  className={cn(
                    "relative aspect-square rounded-lg border-2 overflow-hidden flex flex-col items-center justify-center gap-1 bg-muted transition-colors",
                    backgroundScene === "auto" ? "border-primary" : "border-transparent hover-elevate",
                  )}
                  data-testid="button-scene-auto"
                >
                  <Sparkles className="h-6 w-6 text-muted-foreground" />
                  <span className="text-xs font-medium">Auto</span>
                  <span
                    className="h-2.5 w-2.5 rounded-full ring-1 ring-black/10"
                    style={{ backgroundColor: `hsl(${ACCENT_COLORS[SCENE_ACCENTS[autoScene] ?? "indigo"]?.light})` }}
                    aria-hidden="true"
                  />
                  {backgroundScene === "auto" && (
                    <span className="absolute top-1 right-1 rounded-full bg-primary p-0.5">
                      <Check className="h-3 w-3 text-primary-foreground" />
                    </span>
                  )}
                </button>
                {Object.entries(BACKGROUND_SCENES).map(([key, scene]) => {
                  const active = backgroundScene === key;
                  const dotColor = ACCENT_COLORS[SCENE_ACCENTS[key] ?? "indigo"]?.light;
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => updateSettings.mutate({ backgroundScene: key })}
                      className={cn(
                        "relative aspect-square rounded-lg border-2 overflow-hidden transition-colors",
                        active ? "border-primary" : "border-transparent hover-elevate",
                      )}
                      data-testid={`button-scene-${key}`}
                    >
                      <img src={scene.src} alt={scene.label} className="h-full w-full object-cover" />
                      <span
                        className="absolute top-1.5 left-1.5 h-3 w-3 rounded-full ring-1 ring-white/70 shadow-sm"
                        style={{ backgroundColor: `hsl(${dotColor})` }}
                        aria-hidden="true"
                      />
                      <span className="absolute bottom-0 left-0 right-0 bg-black/50 text-white text-xs font-medium py-1 text-center">
                        {scene.label}
                      </span>
                      {active && (
                        <span className="absolute top-1 right-1 rounded-full bg-primary p-0.5">
                          <Check className="h-3 w-3 text-primary-foreground" />
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
            <p className="text-xs text-muted-foreground mt-3">
              Auto picks a scene based on Mossback's current stage — currently {autoScene}, with
              {/^[aeiou]/i.test(ACCENT_COLORS[SCENE_ACCENTS[autoScene] ?? "indigo"]?.label ?? "") ? " an " : " a "}
              {ACCENT_COLORS[SCENE_ACCENTS[autoScene] ?? "indigo"]?.label.toLowerCase()} accent.
            </p>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
