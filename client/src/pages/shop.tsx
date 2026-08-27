import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Layout } from "@/components/Layout";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { Coins, Lock, Check, ShoppingBag } from "lucide-react";

type SkillId = "strength" | "smarter" | "fishing";

interface SkillState {
  id: SkillId;
  label: string;
  emoji: string;
  xp: number;
}

interface ShopItem {
  row: number;
  name: string;
  skill: SkillId;
  type: string;
  xpRequired: number;
  coinCost: number;
  description: string;
  owned: boolean;
  unlocked: boolean;
  canAfford: boolean;
}

interface ShopResponse {
  items: ShopItem[];
  coins: number;
  skills: SkillState[];
}

const SKILL_TABS: { id: SkillId | "all"; label: string; emoji: string }[] = [
  { id: "all", label: "All", emoji: "🛍️" },
  { id: "strength", label: "Strength", emoji: "💪" },
  { id: "smarter", label: "Smarter", emoji: "🧠" },
  { id: "fishing", label: "Fishing", emoji: "🎣" },
];

// Next unlock tier per skill, used to compute the mini progress bar target.
const TIERS = [0, 50, 150, 300, 500];
function nextTier(xp: number) {
  return TIERS.find((t) => t > xp) ?? TIERS[TIERS.length - 1];
}

function ShopItemCard({ item, onPurchase, pending }: { item: ShopItem; onPurchase: (row: number) => void; pending: boolean }) {
  const locked = !item.unlocked;
  return (
    <Card
      className={cn("border-card-border overflow-hidden", locked && "opacity-70")}
      data-testid={`card-shop-item-${item.row}`}
    >
      <CardContent className="p-4 flex flex-col gap-2">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="font-display font-semibold text-sm leading-snug">{item.name}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{item.description}</p>
          </div>
          {item.owned ? (
            <Badge className="gap-1 shrink-0 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30" variant="outline">
              <Check className="h-3 w-3" /> Owned
            </Badge>
          ) : locked ? (
            <Badge variant="outline" className="gap-1 shrink-0 text-muted-foreground">
              <Lock className="h-3 w-3" />
            </Badge>
          ) : null}
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          <Badge variant="secondary">{item.type}</Badge>
          <Badge variant="outline">
            {locked ? `Unlock at ${item.xpRequired} XP` : `Unlocked at ${item.xpRequired} XP`}
          </Badge>
        </div>
        {!item.owned && (
          <Button
            size="sm"
            className="mt-1 gap-1.5"
            disabled={locked || !item.canAfford || pending}
            onClick={() => onPurchase(item.row)}
            data-testid={`button-buy-${item.row}`}
          >
            <Coins className="h-3.5 w-3.5" />
            {locked ? "Locked" : `Buy for ${item.coinCost}`}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

export default function Shop() {
  const [tab, setTab] = useState<SkillId | "all">("all");
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data, isLoading, isError } = useQuery<ShopResponse>({ queryKey: ["/api/shop"] });

  const purchase = useMutation({
    mutationFn: async (row: number) => {
      const res = await apiRequest("POST", `/api/shop/${row}/purchase`, {});
      return await res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/shop"] });
      qc.invalidateQueries({ queryKey: ["/api/player"] });
      qc.invalidateQueries({ queryKey: ["/api/skills"] });
      toast({ title: "Item purchased!" });
    },
    onError: (err: any) => {
      toast({ title: "Couldn't buy that", description: err?.message, variant: "destructive" });
    },
  });

  const filteredItems = useMemo(() => {
    if (!data) return [];
    const items = tab === "all" ? data.items : data.items.filter((i) => i.skill === tab);
    return [...items].sort((a, b) => a.xpRequired - b.xpRequired);
  }, [data, tab]);

  return (
    <Layout title="Shop">
      {isLoading && (
        <div className="space-y-3">
          <Skeleton className="h-24 w-full rounded-lg" />
          <Skeleton className="h-16 w-full rounded-lg" />
          <Skeleton className="h-16 w-full rounded-lg" />
        </div>
      )}

      {isError && (
        <Card className="border-card-border">
          <CardContent className="py-6 text-center text-sm text-muted-foreground">
            Couldn't load the shop. Pull to refresh in a moment.
          </CardContent>
        </Card>
      )}

      {data && (
        <>
          <Card className="border-card-border mb-4">
            <CardContent className="p-4 space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-muted-foreground">Your coins</p>
                <div className="flex items-center gap-1.5 font-display font-semibold text-lg" data-testid="text-coin-balance">
                  <Coins className="h-4.5 w-4.5 text-amber-500" />
                  {data.coins}
                </div>
              </div>
              <div className="space-y-3">
                {data.skills.map((s) => {
                  const target = nextTier(s.xp);
                  const pct = target > 0 ? Math.min(100, Math.round((s.xp / target) * 100)) : 100;
                  return (
                    <div key={s.id} data-testid={`skill-bar-${s.id}`}>
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="font-medium">
                          {s.emoji} {s.label}
                        </span>
                        <span className="text-muted-foreground">
                          {s.xp} XP{s.xp < target ? ` · ${target - s.xp} to next unlock` : " · maxed"}
                        </span>
                      </div>
                      <Progress value={pct} className="h-2" />
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          <Tabs value={tab} onValueChange={(v) => setTab(v as SkillId | "all")} className="mb-4">
            <TabsList className="grid grid-cols-4 w-full">
              {SKILL_TABS.map((t) => (
                <TabsTrigger key={t.id} value={t.id} data-testid={`tab-skill-${t.id}`}>
                  {t.emoji} {t.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>

          {filteredItems.length === 0 ? (
            <Card className="border-card-border">
              <CardContent className="py-10 text-center">
                <ShoppingBag className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">No items here yet.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {filteredItems.map((item) => (
                <ShopItemCard key={item.row} item={item} onPurchase={(row) => purchase.mutate(row)} pending={purchase.isPending} />
              ))}
            </div>
          )}
        </>
      )}
    </Layout>
  );
}
