import { useEffect, useState } from "react";
import { buildDepth, fmt, type Ticker } from "@/lib/market";

export function OrderBook({ ticker, step }: { ticker?: Ticker; step: number }) {
  const [depth, setDepth] = useState(() => buildDepth(ticker?.price ?? 100, ticker?.decimals ?? 2, step));

  useEffect(() => {
    if (!ticker) return;
    setDepth(buildDepth(ticker.price, ticker.decimals, step));
  }, [ticker?.price, ticker?.decimals, step, ticker]);

  if (!ticker) return null;
  const decimals = ticker.decimals;

  return (
    <div className="surface flex h-full flex-col p-3">
      <div className="flex items-center justify-between text-[11px] uppercase tracking-wide text-muted-foreground">
        <span>Price</span>
        <span>Quantity</span>
      </div>

      <div className="mt-2 space-y-[3px]">
        {depth.asks.map((level, i) => (
          <Row key={`a${i}`} price={level.price} qty={level.qty} max={depth.max} decimals={decimals} side="down" />
        ))}
      </div>

      <div className="my-2 flex items-baseline justify-between border-y border-border py-2">
        <span
          className={`num text-lg font-semibold ${ticker.price >= ticker.prevPrice ? "text-up" : "text-down"}`}
        >
          {fmt(ticker.price, decimals)}
        </span>
        <span className="text-xs text-muted-foreground">Last price</span>
      </div>

      <div className="space-y-[3px]">
        {depth.bids.map((level, i) => (
          <Row key={`b${i}`} price={level.price} qty={level.qty} max={depth.max} decimals={decimals} side="up" />
        ))}
      </div>
    </div>
  );
}

function Row({
  price,
  qty,
  max,
  decimals,
  side,
}: {
  price: number;
  qty: number;
  max: number;
  decimals: number;
  side: "up" | "down";
}) {
  const width = Math.min((qty / max) * 100, 100);
  return (
    <div className="relative flex items-center justify-between overflow-hidden rounded px-1 py-[3px] text-xs">
      <span
        className={`absolute inset-y-0 right-0 ${side === "up" ? "bg-up-soft" : "bg-down-soft"}`}
        style={{ width: `${width}%` }}
      />
      <span className={`num relative ${side === "up" ? "text-up" : "text-down"}`}>{fmt(price, decimals)}</span>
      <span className="num relative text-muted-foreground">{fmt(qty, 2)}</span>
    </div>
  );
}
