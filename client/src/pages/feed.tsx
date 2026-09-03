import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Layout } from "@/components/Layout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { Coins, Heart, Drumstick } from "lucide-react";

interface FeedItem {
  id: string;
  name: string;
  emoji: string;
  cost: number;
  description: string;
}

interface FeedResponse {
  items: FeedItem[];
  coins: number;
  health: number;
}

export default function Feed() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data, isLoading, isError } = useQuery<FeedResponse>({ queryKey: ["/api/feed"] });

  const feedMutation = useMutation({
    mutationFn: async (itemId: string) => {
      const res = await apiRequest("POST", `/api/feed/${itemId}`, {});
      return await res.json();
    },
    onSuccess: (result, itemId) => {
      qc.invalidateQueries({ queryKey: ["/api/feed"] });
      qc.invalidateQueries({ queryKey: ["/api/checkin"] });
      qc.invalidateQueries({ queryKey: ["/api/player"] });
      qc.invalidateQueries({ queryKey: ["/api/skills"] });
      const item = data?.items.find((i) => i.id === itemId);
      toast({ title: `Fed ${item?.name ?? "your companion"}! ${item?.emoji ?? "🍽️"}` });
    },
    onError: (err: any) => {
      toast({
        title: "Couldn't feed your companion",
        description: err?.message || "Something went wrong. Try again.",
        variant: "destructive",
      });
    },
  });

  return (
    <Layout title="Feed">
      {isLoading && (
        <div className="space-y-3">
          <Skeleton className="h-20 w-full rounded-lg" />
          <Skeleton className="h-24 w-full rounded-lg" />
          <Skeleton className="h-24 w-full rounded-lg" />
        </div>
      )}

      {isError && (
        <Card className="border-card-border">
          <CardContent className="py-6 text-center text-sm text-muted-foreground">
            Couldn't load the feed screen. Pull to refresh in a moment.
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
              <div data-testid="feed-health-bar">
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="font-medium flex items-center gap-1">
                    <Heart className={cn("h-3.5 w-3.5", data.health <= 25 ? "text-destructive" : "text-rose-500")} fill="currentColor" />
                    Health
                  </span>
                  <span className="text-muted-foreground">{data.health}%</span>
                </div>
                <Progress value={data.health} className={cn("h-2", data.health <= 25 && "[&>div]:bg-destructive")} />
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {data.items.map((item) => {
              const canAfford = data.coins >= item.cost;
              return (
                <Card key={item.id} className="border-card-border" data-testid={`card-feed-item-${item.id}`}>
                  <CardContent className="p-4 flex flex-col gap-2">
                    <div className="flex items-start gap-2.5">
                      <div
                        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-xl bg-amber-500/15"
                        aria-hidden="true"
                      >
                        {item.emoji}
                      </div>
                      <div>
                        <p className="font-display font-semibold text-sm leading-snug">{item.name}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{item.description}</p>
                      </div>
                    </div>
                    <Button
                      size="sm"
                      className="mt-1 gap-1.5"
                      disabled={!canAfford || feedMutation.isPending}
                      onClick={() => feedMutation.mutate(item.id)}
                      data-testid={`button-feed-${item.id}`}
                    >
                      <Drumstick className="h-3.5 w-3.5" />
                      {canAfford ? `Feed for ${item.cost}` : `Need ${item.cost} coins`}
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </>
      )}
    </Layout>
  );
}
