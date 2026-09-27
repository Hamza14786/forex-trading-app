import { createFileRoute } from "@tanstack/react-router";
import { ArrowDownUp, ChevronRight, Wallet } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { BottomNav } from "@/components/BottomNav";
import { ScreenHeader } from "@/components/ScreenHeader";
import { useUsdtBalance } from "@/lib/use-usdt-balance";

export const Route = createFileRoute("/_authenticated/transfer")({
  head: () => ({
    meta: [
      { title: "Transfer — Polygon" },
      { name: "description", content: "Review an internal transfer between demo accounts." },
    ],
  }),
  component: TransferPage,
});

const CURRENCIES = ["USDT", "BTC", "ETH", "XAUT", "BCH", "LTC", "ADA", "TRX", "LINK", "EOS"];
const ACCOUNTS = ["Spot", "Futures"] as const;

function TransferPage() {
  const usdtBalance = useUsdtBalance();
  const [from, setFrom] = useState<(typeof ACCOUNTS)[number]>("Spot");
  const [to, setTo] = useState<(typeof ACCOUNTS)[number]>("Futures");
  const [currency, setCurrency] = useState("USDT");
  const [amount, setAmount] = useState("");
  const available = currency === "USDT" ? usdtBalance * (from === "Spot" ? 1 : 0.11) : 0;

  function swapAccounts() {
    setFrom(to);
    setTo(from);
  }

  function confirmTransfer() {
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0 || value > available) {
      toast.error("Enter an amount within the available balance.");
      return;
    }
    toast.info("Transfers are simulated in this demo. No balance was changed.");
  }

  return (
    <div className="mx-auto w-full max-w-[900px] pb-24">
      <ScreenHeader title="Transfer" back="/assets" />

      <div className="space-y-4 p-4 sm:p-6">
        <section className="surface relative rounded-2xl p-4 pr-16 sm:p-5 sm:pr-20">
          <label className="block text-xs font-medium text-muted-foreground" htmlFor="transfer-from">From account</label>
          <div className="mt-1 flex items-center gap-2">
            <select
              id="transfer-from"
              value={from}
              onChange={(event) => setFrom(event.target.value as (typeof ACCOUNTS)[number])}
              className="w-full bg-transparent text-base font-semibold outline-none"
            >
              {ACCOUNTS.map((account) => <option key={account} value={account}>{account}</option>)}
            </select>
            <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
          </div>
          <div className="my-4 border-t border-border" />
          <label className="block text-xs font-medium text-muted-foreground" htmlFor="transfer-to">To account</label>
          <div className="mt-1 flex items-center gap-2">
            <select
              id="transfer-to"
              value={to}
              onChange={(event) => setTo(event.target.value as (typeof ACCOUNTS)[number])}
              className="w-full bg-transparent text-base font-semibold outline-none"
            >
              {ACCOUNTS.map((account) => <option key={account} value={account}>{account}</option>)}
            </select>
            <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
          </div>
          <button
            type="button"
            onClick={swapAccounts}
            aria-label="Swap source and destination accounts"
            className="absolute right-4 top-1/2 flex size-10 -translate-y-1/2 items-center justify-center rounded-full bg-secondary text-primary transition-colors hover:bg-accent sm:right-5"
          >
            <ArrowDownUp className="size-4" />
          </button>
        </section>

        <label className="surface flex items-center gap-3 rounded-2xl px-4">
          <Wallet className="size-4 shrink-0 text-primary" />
          <span className="shrink-0 text-sm text-muted-foreground">Transfer currency</span>
          <select
            value={currency}
            onChange={(event) => setCurrency(event.target.value)}
            aria-label="Transfer currency"
            className="h-12 min-w-0 flex-1 appearance-none bg-transparent text-right text-sm font-semibold outline-none"
          >
            {CURRENCIES.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
          <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
        </label>

        <section className="surface rounded-2xl p-4 sm:p-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <label className="text-sm font-medium" htmlFor="transfer-amount">Amount</label>
            <span className="text-xs text-muted-foreground">
              Available: <span className="num text-foreground">{available.toLocaleString("en-US", { maximumFractionDigits: 8 })} {currency}</span>
            </span>
          </div>
          <div className="flex items-center rounded-xl bg-secondary px-4 focus-within:ring-1 focus-within:ring-primary">
            <input
              id="transfer-amount"
              type="number"
              min="0"
              max={available}
              step="any"
              inputMode="decimal"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              placeholder="Enter amount"
              className="h-12 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
            <button
              type="button"
              onClick={() => setAmount(available > 0 ? String(available) : "")}
              className="border-l border-border pl-3 text-sm font-semibold text-primary"
            >
              All
            </button>
          </div>
        </section>

        <button
          type="button"
          onClick={confirmTransfer}
          disabled={from === to}
          className="h-12 w-full rounded-xl bg-primary text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          Confirm
        </button>
        <p className="px-1 text-xs leading-relaxed text-muted-foreground">
          Transfers between Spot and Futures are for demonstration only. Confirming will not move funds.
        </p>
      </div>

      <BottomNav />
    </div>
  );
}
