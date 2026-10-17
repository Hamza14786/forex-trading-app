import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Eye, EyeOff, LogOut, Search } from "lucide-react";
import { toast } from "sonner";
import { useMarket, fmt } from "@/lib/market";
import { BottomNav } from "@/components/BottomNav";
import { ScreenHeader } from "@/components/ScreenHeader";
import { supabase } from "@/integrations/supabase/client";
import { useUsdtBalances } from "@/lib/use-usdt-balances";

export const Route = createFileRoute("/_authenticated/assets")({
  head: () => ({
    meta: [
      { title: "Assets — Polygon" },
      { name: "description", content: "Review funding and futures balances, freeze amounts and USD value." },
      { property: "og:title", content: "Assets — Polygon" },
      { property: "og:description", content: "Funding and futures balances in one place." },
    ],
  }),
  component: AssetsPage,
});

const ASSETS = ["USDT", "BTC", "ETH", "XAUT", "BCH", "LTC", "ADA", "TRX", "LINK", "EOS"];

function AssetsPage() {
  const navigate = useNavigate();
  const { tickers } = useMarket();
  const [wallet, setWallet] = useState<"Funding" | "Futures">("Funding");
  const [query, setQuery] = useState("");
  const [hideZero, setHideZero] = useState(false);
  const [visible, setVisible] = useState(true);
  const balances = useUsdtBalances();

  const rows = useMemo(() => {
    return ASSETS.map((code) => {
      const price = code === "USDT" ? 1 : (tickers[`${code}/USDT`]?.price ?? 0);
      const available = code === "USDT" ? (wallet === "Funding" ? balances.spot : balances.futures) : 0;
      const freeze = 0;
      return { code, available, freeze, usd: (available + freeze) * price };
    });
  }, [tickers, wallet, balances]);

  const filtered = rows
    .filter((r) => r.code.toLowerCase().includes(query.toLowerCase()))
    .filter((r) => (hideZero ? r.available + r.freeze > 0 : true));

  const totalUsd = rows.reduce((sum, r) => sum + r.usd, 0);

  async function logout() {
    const { error } = await supabase.auth.signOut();
    if (error) {
      toast.error("Could not log out. Please try again.");
      return;
    }
    navigate({ to: "/auth", replace: true });
  }

  return (
    <div className="mx-auto w-full max-w-[1500px] pb-24">
      <ScreenHeader
        title="Assets"
        right={
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={logout}
              aria-label="Log out"
              title="Log out"
              className="flex h-9 items-center justify-center gap-1.5 rounded-lg px-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <LogOut className="size-4" />
              <span>Logout</span>
            </button>
          </div>
        }
      />

      <section className="surface m-4 p-4">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          Total assets converted (USDT)
          <button onClick={() => setVisible((v) => !v)} aria-label="Toggle balance visibility">
            {visible ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
          </button>
        </div>
        <p className="num mt-1 text-2xl font-semibold">{visible ? fmt(totalUsd, 4) : "••••••"}</p>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <button
            onClick={() => navigate({ to: "/withdraw" })}
            className="rounded-lg bg-primary py-2.5 text-sm font-semibold text-primary-foreground"
          >
            Withdraw
          </button>
          <button
            onClick={() => navigate({ to: "/transfer" })}
            className="rounded-lg bg-secondary py-2.5 text-sm font-semibold"
          >
            Transfer
          </button>
        </div>
      </section>

      <div className="grid grid-cols-2 border-b border-border text-sm">
        {(["Funding", "Futures"] as const).map((w) => (
          <button
            key={w}
            onClick={() => setWallet(w)}
            className={`py-3 transition-colors ${
              wallet === w ? "border-b-2 border-primary text-primary" : "text-muted-foreground"
            }`}
          >
            {w}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-3">
        <div className="flex min-w-0 items-center gap-2 rounded-lg bg-secondary px-3 py-2">
          <Search className="size-4 shrink-0 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search currency"
            className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
        </div>
        <label className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={hideZero}
            onChange={(e) => setHideZero(e.target.checked)}
            className="accent-[var(--primary)]"
          />
          Hide 0 balances
        </label>
      </div>

      <div className="space-y-2 px-4">
        {filtered.map((r) => (
          <div key={r.code} className="surface p-4">
            <div className="flex items-center justify-between">
              <div className="flex min-w-0 items-center gap-2.5">
                <CoinBadge symbol={r.code} />
                <span className="font-medium">{r.code}</span>
              </div>
              <span className="num text-sm">{visible ? fmt(r.usd, 4) : "••••"}</span>
            </div>
            <div className="mt-2 grid grid-cols-3 gap-2 text-xs text-muted-foreground">
              <Cell label="Available" value={visible ? fmt(r.available, 8) : "••••"} />
              <Cell label="Freeze" value={visible ? fmt(r.freeze, 8) : "••••"} />
              <Cell label="USD value" value={visible ? fmt(r.usd, 4) : "••••"} align="right" />
            </div>
          </div>
        ))}
        {filtered.length === 0 && (
          <p className="py-12 text-center text-sm text-muted-foreground">No currencies match your search.</p>
        )}
      </div>

      <BottomNav />
    </div>
  );
}

function CoinBadge({ symbol }: { symbol: string }) {
  return (
    <div className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-full border border-white/10 bg-white/5 p-1 shadow-inner">
      <img
        src={`https://assets.coincap.io/assets/icons/${symbol.toLowerCase()}@2x.png`}
        alt={`${symbol} logo`}
        className="size-full object-contain"
        loading="lazy"
        onError={(event) => {
          event.currentTarget.style.display = "none";
        }}
      />
    </div>
  );
}

function Cell({ label, value, align }: { label: string; value: string; align?: "right" }) {
  return (
    <div className={align === "right" ? "text-right" : ""}>
      <p>{label}</p>
      <p className="num text-foreground">{value}</p>
    </div>
  );
}
