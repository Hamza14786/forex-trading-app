import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useMarket, fmt } from "@/lib/market";
import { OrderBook } from "@/components/OrderBook";
import { BottomNav } from "@/components/BottomNav";
import { ScreenHeader } from "@/components/ScreenHeader";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/spot")({
  validateSearch: (search: Record<string, unknown>) => ({
    pair: typeof search["pair"] === "string" ? (search["pair"] as string) : "ETH/USDT",
  }),
  head: () => ({
    meta: [
      { title: "Spot trading — Polygon" },
      { name: "description", content: "Place simulated spot market orders with a live order book." },
      { property: "og:title", content: "Spot trading — Polygon" },
      { property: "og:description", content: "Simulated spot order entry and live market depth." },
    ],
  }),
  component: SpotPage,
});

const TABS = ["Transaction", "Current order", "History"] as const;

function SpotPage() {
  const { pair } = Route.useSearch();
  const { tickers, list } = useMarket();
  const [symbol, setSymbol] = useState(pair);
  const [tab, setTab] = useState<(typeof TABS)[number]>("Transaction");
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [percent, setPercent] = useState(0);
  const [balance, setBalance] = useState(0);

  useEffect(() => {
    let active = true;
    let balanceChannel: ReturnType<typeof supabase.channel> | undefined;
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) return;
      const { data: wallet } = await supabase
        .from("user_balances")
        .select("usdt")
        .eq("user_id", data.user.id)
        .maybeSingle();
      if (active) setBalance(wallet?.usdt ?? 0);
      balanceChannel = supabase
        .channel(`spot-balance-${data.user.id}`)
        .on("postgres_changes", {
          event: "UPDATE",
          schema: "public",
          table: "user_balances",
          filter: `user_id=eq.${data.user.id}`,
        }, (payload) => {
          setBalance(Number((payload.new as { usdt: number }).usdt) || 0);
        })
        .subscribe();
    });
    return () => {
      active = false;
      if (balanceChannel) void supabase.removeChannel(balanceChannel);
    };
  }, []);

  const ticker = tickers[symbol] ?? tickers["ETH/USDT"]!;
  const total = useMemo(() => (balance * percent) / 100, [percent]);
  const qty = ticker ? total / ticker.price : 0;
  const step = Math.max(ticker.price * 0.0002, 10 ** -ticker.decimals);

  return (
    <div className="mx-auto w-full max-w-[1500px] pb-24">
      <ScreenHeader title="Spot" />

      <div className="grid grid-cols-3 border-b border-border text-sm">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`py-3 transition-colors ${
              tab === t ? "border-b-2 border-primary text-primary" : "text-muted-foreground"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab !== "Transaction" ? (
        <p className="px-4 py-16 text-center text-sm text-muted-foreground">
          No {tab.toLowerCase()} yet. Orders you place in this demo appear here.
        </p>
      ) : (
        <div className="grid gap-4 p-4 lg:grid-cols-[1fr_360px]">
          <div className="space-y-4">
            <select
              value={symbol}
              onChange={(e) => setSymbol(e.target.value)}
              className="w-full rounded-lg border border-input bg-card px-3 py-2.5 text-sm outline-none"
            >
              {list.map((t) => (
                <option key={t.symbol} value={t.symbol}>
                  {t.symbol}
                </option>
              ))}
            </select>

            <div className="grid grid-cols-2 gap-1 rounded-lg bg-secondary p-1">
              <button
                onClick={() => setSide("buy")}
                className={`rounded-md py-2.5 text-sm font-semibold transition-colors ${
                  side === "buy" ? "bg-up text-background" : "text-muted-foreground"
                }`}
              >
                Buy
              </button>
              <button
                onClick={() => setSide("sell")}
                className={`rounded-md py-2.5 text-sm font-semibold transition-colors ${
                  side === "sell" ? "bg-down text-background" : "text-muted-foreground"
                }`}
              >
                Sell
              </button>
            </div>

            <div className="surface space-y-4 p-4">
              <p className="text-sm text-muted-foreground">Executed at the best market price</p>

              <div className="flex items-center justify-between border-b border-border pb-2">
                <span className="text-sm text-muted-foreground">Total price</span>
                <span className="num text-sm">{fmt(total, 2)} USDT</span>
              </div>

              <div className="space-y-1 text-xs text-muted-foreground">
                <p className="num">
                  Available: {fmt(balance, 2)} USDT · {fmt(0.482, 8)} {ticker.base}
                </p>
              </div>

              <div>
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>0%</span>
                  <span className="num">{percent}%</span>
                  <span>100%</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={percent}
                  onChange={(e) => setPercent(Number(e.target.value))}
                  className="mt-2 w-full accent-[var(--primary)]"
                />
                <div className="mt-2 grid grid-cols-4 gap-2">
                  {[25, 50, 75, 100].map((p) => (
                    <button
                      key={p}
                      onClick={() => setPercent(p)}
                      className="rounded-md bg-secondary py-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
                    >
                      {p}%
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-between border-t border-border pt-3 text-sm">
                <span className="text-muted-foreground">Estimated quantity</span>
                <span className="num">
                  {fmt(qty, 6)} {ticker.base}
                </span>
              </div>

              <button
                onClick={() =>
                  toast.success(
                    `${side === "buy" ? "Buy" : "Sell"} ${fmt(qty, 6)} ${ticker.base} submitted (demo)`,
                  )
                }
                className={`w-full rounded-lg py-3 text-sm font-semibold text-background ${
                  side === "buy" ? "bg-up" : "bg-down"
                }`}
              >
                {side === "buy" ? "Buy" : "Sell"} {ticker.base}
              </button>
            </div>
          </div>

          <OrderBook ticker={ticker} step={step} />
        </div>
      )}

      <BottomNav />
    </div>
  );
}
