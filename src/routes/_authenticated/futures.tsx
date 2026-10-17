import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { LoaderCircle } from "lucide-react";
import { useMarket, fmt } from "@/lib/market";
import { OrderBook } from "@/components/OrderBook";
import { BottomNav } from "@/components/BottomNav";
import { ScreenHeader } from "@/components/ScreenHeader";
import { useUsdtBalances } from "@/lib/use-usdt-balances";

export const Route = createFileRoute("/_authenticated/futures")({
  head: () => ({
    meta: [
      { title: "Futures trading — Polygon" },
      { name: "description", content: "Open simulated leveraged positions with live depth and risk metrics." },
      { property: "og:title", content: "Futures trading — Polygon" },
      { property: "og:description", content: "Leverage, margin and risk rate on simulated futures markets." },
    ],
  }),
  component: FuturesPage,
});

const LEVERAGE = [5, 10, 20, 50, 100];

function FuturesPage() {
  const { tickers, list } = useMarket();
  const balances = useUsdtBalances();
  const [symbol, setSymbol] = useState("XAUT/USDT");
  const [tab, setTab] = useState<"Open position" | "Delegation">("Open position");
  const [leverage, setLeverage] = useState(20);
  const [percent, setPercent] = useState(25);
  const [loadingAction, setLoadingAction] = useState<"buy" | "sell" | null>(null);

  function handleAction(action: "buy" | "sell") {
    if (loadingAction) return;
    setLoadingAction(action);
    window.setTimeout(() => setLoadingAction(null), 2000);
  }

  const ticker = tickers[symbol] ?? tickers["XAUT/USDT"]!;
  const equity = balances.futures;
  const margin = (equity * percent) / 100;
  const pnl = (ticker.price - ticker.prevPrice) * leverage * 12;
  const riskRate = Math.min(Math.abs(pnl) / Math.max(equity, 1) * 100, 99.9);
  const step = Math.max(ticker.price * 0.0003, 10 ** -ticker.decimals);

  return (
    <div className="mx-auto w-full max-w-[1500px] pb-24">
      <ScreenHeader title="Futures" />

      <div className="grid grid-cols-2 border-b border-border text-sm">
        {(["Open position", "Delegation"] as const).map((t) => (
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

      {tab === "Delegation" ? (
        <p className="px-4 py-16 text-center text-sm text-muted-foreground">
          No open delegations. Positions you open in this demo appear here.
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

            <div className="surface grid grid-cols-3 gap-2 p-4 text-center">
              <Stat label="Equity (USDT)" value={fmt(equity, 2)} />
              <Stat
                label="Profit / loss"
                value={fmt(pnl, 2)}
                tone={pnl >= 0 ? "up" : "down"}
              />
              <Stat label="Risk rate" value={`${riskRate.toFixed(2)}%`} />
            </div>

            <div className="surface space-y-4 p-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Leverage</span>
                <div className="flex gap-1">
                  {LEVERAGE.map((l) => (
                    <button
                      key={l}
                      onClick={() => setLeverage(l)}
                      className={`rounded-md px-2.5 py-1 text-xs transition-colors ${
                        leverage === l ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"
                      }`}
                    >
                      {l}x
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-between rounded-lg bg-secondary px-3 py-2.5">
                <span className="text-sm text-muted-foreground">Price</span>
                <span className="num text-sm text-primary">Market price {fmt(ticker.price, ticker.decimals)}</span>
              </div>

              <div className="flex items-center justify-between rounded-lg bg-secondary px-3 py-2.5">
                <span className="text-sm text-muted-foreground">Margin</span>
                <span className="num text-sm">{fmt(margin, 2)} USDT</span>
              </div>

              <div className="grid grid-cols-4 gap-2">
                {[25, 50, 75, 100].map((p) => (
                  <button
                    key={p}
                    onClick={() => setPercent(p)}
                    className={`rounded-md py-2 text-xs transition-colors ${
                      percent === p ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"
                    }`}
                  >
                    {p}%
                  </button>
                ))}
              </div>

              <div className="grid gap-2">
                <button
                  onClick={() => handleAction("buy")}
                  disabled={loadingAction !== null}
                  className="rounded-lg bg-up py-3 text-sm font-semibold text-background disabled:cursor-wait disabled:opacity-75"
                >
                  {loadingAction === "buy" ? (
                    <span className="inline-flex items-center justify-center gap-2">
                      <LoaderCircle className="size-4 animate-spin" /> Loading...
                    </span>
                  ) : "Buy (bullish)"}
                </button>
                <button
                  onClick={() => handleAction("sell")}
                  disabled={loadingAction !== null}
                  className="rounded-lg bg-down py-3 text-sm font-semibold text-background disabled:cursor-wait disabled:opacity-75"
                >
                  {loadingAction === "sell" ? (
                    <span className="inline-flex items-center justify-center gap-2">
                      <LoaderCircle className="size-4 animate-spin" /> Loading...
                    </span>
                  ) : "Sell (bearish)"}
                </button>
              </div>

              <p className="num text-xs text-muted-foreground">Available {fmt(equity, 2)} USDT</p>
            </div>
          </div>

          <OrderBook ticker={ticker} step={step} />
        </div>
      )}

      <BottomNav />
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "up" | "down" }) {
  return (
    <div>
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p
        className={`num text-sm font-semibold ${
          tone === "up" ? "text-up" : tone === "down" ? "text-down" : "text-foreground"
        }`}
      >
        {value}
      </p>
    </div>
  );
}
