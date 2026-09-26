import { useEffect, useState } from "react";

export type Ticker = {
  symbol: string;
  base: string;
  quote: string;
  price: number;
  prevPrice: number;
  changePct: number;
  volume: number;
  decimals: number;
};

type Seed = {
  base: string;
  price: number;
  volume: number;
  decimals: number;
  volatility: number;
};

const SEEDS: Seed[] = [
  { base: "BTC", price: 84038.9, volume: 51204331, decimals: 1, volatility: 0.0008 },
  { base: "ETH", price: 2686.91, volume: 48468821, decimals: 2, volatility: 0.0011 },
  { base: "XAUT", price: 4283.17, volume: 897500, decimals: 2, volatility: 0.0005 },
  { base: "BCH", price: 335.5, volume: 570085, decimals: 2, volatility: 0.0015 },
  { base: "LTC", price: 72.86, volume: 1670467, decimals: 2, volatility: 0.0016 },
  { base: "ETC", price: 9.4945, volume: 574832, decimals: 4, volatility: 0.002 },
  { base: "LINK", price: 14.2229, volume: 1099619, decimals: 4, volatility: 0.0021 },
  { base: "ADA", price: 0.255, volume: 1564899, decimals: 4, volatility: 0.0024 },
  { base: "TRX", price: 0.3369, volume: 3815745, decimals: 4, volatility: 0.0018 },
  { base: "DASH", price: 68.29, volume: 1451431, decimals: 2, volatility: 0.0025 },
  { base: "XMR", price: 218.44, volume: 421009, decimals: 2, volatility: 0.0019 },
  { base: "EOS", price: 0.612, volume: 984100, decimals: 4, volatility: 0.0026 },
];

/** In-memory simulated market feed. Swap this module for a real market-data API later. */
class MarketFeed {
  private tickers: Record<string, Ticker> = {};
  private listeners = new Set<() => void>();
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    for (const seed of SEEDS) {
      const symbol = `${seed.base}/USDT`;
      this.tickers[symbol] = {
        symbol,
        base: seed.base,
        quote: "USDT",
        price: seed.price,
        prevPrice: seed.price,
        changePct: (Math.random() - 0.4) * 3,
        volume: seed.volume,
        decimals: seed.decimals,
      };
    }
  }

  snapshot() {
    return this.tickers;
  }

  subscribe(fn: () => void) {
    this.listeners.add(fn);
    this.start();
    return () => {
      this.listeners.delete(fn);
      if (this.listeners.size === 0) this.stop();
    };
  }

  private start() {
    if (this.timer) return;
    this.timer = setInterval(() => this.tick(), 1200);
  }

  private stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private tick() {
    const next: Record<string, Ticker> = {};
    for (const seed of SEEDS) {
      const symbol = `${seed.base}/USDT`;
      const current = this.tickers[symbol]!;
      const drift = (Math.random() - 0.5) * 2 * seed.volatility;
      const price = Math.max(current.price * (1 + drift), seed.price * 0.5);
      next[symbol] = {
        ...current,
        prevPrice: current.price,
        price,
        changePct: current.changePct + drift * 100 * 0.6,
        volume: Math.max(current.volume + Math.round((Math.random() - 0.45) * seed.volume * 0.002), 0),
      };
    }
    this.tickers = next;
    this.listeners.forEach((fn) => fn());
  }
}

let feed: MarketFeed | null = null;
function getFeed() {
  if (!feed) feed = new MarketFeed();
  return feed;
}

export function useMarket() {
  const [tickers, setTickers] = useState<Record<string, Ticker>>(() => getFeed().snapshot());

  useEffect(() => {
    const f = getFeed();
    setTickers({ ...f.snapshot() });
    return f.subscribe(() => setTickers({ ...f.snapshot() }));
  }, []);

  return { tickers, list: Object.values(tickers) };
}

export function useTicker(symbol: string) {
  const { tickers } = useMarket();
  return tickers[symbol];
}

export type DepthLevel = { price: number; qty: number; total: number };

export function buildDepth(price: number, decimals: number, seedStep: number) {
  const step = seedStep;
  const asks: DepthLevel[] = [];
  const bids: DepthLevel[] = [];
  for (let i = 8; i >= 1; i--) {
    const qty = Math.random() * 700 + 5;
    asks.push({ price: price + step * i, qty, total: qty * (price + step * i) });
  }
  for (let i = 1; i <= 8; i++) {
    const qty = Math.random() * 700 + 5;
    bids.push({ price: price - step * i, qty, total: qty * (price - step * i) });
  }
  const max = Math.max(...asks.map((a) => a.qty), ...bids.map((b) => b.qty));
  return { asks, bids, max, decimals };
}

export function fmt(value: number, decimals = 2) {
  return value.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}
