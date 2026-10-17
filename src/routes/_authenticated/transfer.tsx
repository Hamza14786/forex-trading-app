import { createFileRoute } from "@tanstack/react-router";
import { ArrowDownUp, ChevronRight, Wallet } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { BottomNav } from "@/components/BottomNav";
import { ScreenHeader } from "@/components/ScreenHeader";
import { supabase } from "@/integrations/supabase/client";
import { useUsdtBalances } from "@/lib/use-usdt-balances";

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
  const balances = useUsdtBalances();
  const [from, setFrom] = useState<(typeof ACCOUNTS)[number]>("Spot");
  const [to, setTo] = useState<(typeof ACCOUNTS)[number]>("Futures");
  const [currency, setCurrency] = useState("USDT");
  const [amount, setAmount] = useState("");
  const available = currency === "USDT" ? balances[from.toLowerCase() as "spot" | "futures"] : 0;
  const [transferring, setTransferring] = useState(false);

  function swapAccounts() {
    setFrom(to);
    setTo(from);
  }

  async function confirmTransfer() {
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0 || value > available) {
      toast.error("Enter an amount within the available balance.");
      return;
    }
    setTransferring(true);
    try {
      const { data: { session }, error: sessionError } = await withTimeout(
        supabase.auth.getSession(),
        8000,
        "Session check timed out. Please try again.",
      );
      if (sessionError) throw new Error(`Could not read your login session: ${sessionError.message}`);
      if (!session?.user.id || !session.access_token) {
        throw new Error("Your session has expired. Sign in again and retry the transfer.");
      }

      const controller = new AbortController();
      let requestTimedOut = false;
      const timeout = window.setTimeout(() => {
        requestTimedOut = true;
        controller.abort();
      }, 20000);
      let error;
      try {
        ({ error } = await supabase.rpc("transfer_usdt_between_accounts", {
          _from_account: from,
          _to_account: to,
          _amount: value,
        }).abortSignal(controller.signal));
      } finally {
        window.clearTimeout(timeout);
      }

      if (error) {
        if (requestTimedOut) throw new Error("Transfer request timed out. Please retry.");
        if (error.code === "PGRST202") {
          throw new Error("Transfer RPC is missing in Supabase. Apply migration 0006 and retry.");
        }
        if (error.message.includes("Insufficient")) {
          throw new Error("Insufficient available balance in the selected source account.");
        }
        throw new Error(`Transfer failed: ${error.message}`);
      }

      setAmount("");
      toast.success(`Transferred ${value} USDT from ${from} to ${to}.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Transfer failed. Please try again.";
      toast.error(error instanceof Error && (error.name === "AbortError" || message.toLowerCase().includes("aborted"))
        ? "Transfer request timed out. Please retry."
        : message);
    } finally {
      setTransferring(false);
    }
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
          disabled={from === to || transferring}
          className="h-12 w-full rounded-xl bg-primary text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {transferring ? "Transferring…" : "Confirm"}
        </button>
        <p className="px-1 text-xs leading-relaxed text-muted-foreground">
          Transfers between Spot and Futures update your USDT available balance instantly.
        </p>
      </div>

      <BottomNav />
    </div>
  );
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => reject(new Error(message)), timeoutMs);
    promise.then(
      (value) => {
        window.clearTimeout(timeout);
        resolve(value);
      },
      (error: unknown) => {
        window.clearTimeout(timeout);
        reject(error);
      },
    );
  });
}
