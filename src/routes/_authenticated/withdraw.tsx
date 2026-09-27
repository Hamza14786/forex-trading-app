import { createFileRoute } from "@tanstack/react-router";
import { ArrowRight, Check, ChevronDown, Wallet } from "lucide-react";
import { toast } from "sonner";
import { BottomNav } from "@/components/BottomNav";
import { ScreenHeader } from "@/components/ScreenHeader";
import { useUsdtBalance } from "@/lib/use-usdt-balance";
import { useState, type FormEvent } from "react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/withdraw")({
  head: () => ({
    meta: [
      { title: "Withdraw — Polygon" },
      { name: "description", content: "Enter withdrawal details for your demo assets." },
    ],
  }),
  component: WithdrawPage,
});

const CURRENCIES = ["USDT", "BTC", "ETH", "IDR", "INR", "MYR"];

function WithdrawPage() {
  const usdtBalance = useUsdtBalance();
  const [currency, setCurrency] = useState("USDT");
  const [currencyMenuOpen, setCurrencyMenuOpen] = useState(false);
  const [address, setAddress] = useState("");
  const [quantity, setQuantity] = useState("");
  const [sending, setSending] = useState(false);
  const available = currency === "USDT" ? usdtBalance : 0;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const amount = Number(quantity);
    if (!address.trim()) {
      toast.error("Enter a withdrawal address.");
      return;
    }
    if (!Number.isFinite(amount) || amount <= 0 || amount > available) {
      toast.error("Enter an amount within your available balance.");
      return;
    }

    setSending(true);
    try {
      const { data: userData, error: userError } = await supabase.auth.getUser();
      const user = userData.user;
      if (userError || !user) throw new Error("Please sign in again before requesting a withdrawal.");

      const { data: existingConversation, error: conversationLookupError } = await supabase
        .from("conversations")
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle();
      if (conversationLookupError) throw new Error("Could not open your support conversation.");

      let conversationId = existingConversation?.id;
      if (!conversationId) {
        const { data: createdConversation, error: createConversationError } = await supabase
          .from("conversations")
          .insert({ user_id: user.id })
          .select("id")
          .single();
        if (createConversationError || !createdConversation) {
          // A chat page opened at the same time may have created the unique row already.
          const { data: racedConversation } = await supabase
            .from("conversations")
            .select("id")
            .eq("user_id", user.id)
            .maybeSingle();
          if (!racedConversation) throw new Error("Could not start your support conversation.");
          conversationId = racedConversation.id;
        } else {
          conversationId = createdConversation.id;
        }
      }

      const body = [
        "This account wants to withdraw.",
        "",
        "Withdrawal details:",
        `Currency: ${currency}`,
        `Withdrawal address: ${address.trim()}`,
        `Quantity: ${amount.toLocaleString("en-US", { maximumFractionDigits: 8 })} ${currency}`,
        `Available balance: ${available.toLocaleString("en-US", { maximumFractionDigits: 8 })} ${currency}`,
        `Handling fee: 0 ${currency}`,
      ].join("\n");
      const { error: messageError } = await supabase.from("messages").insert({
        conversation_id: conversationId,
        sender_id: user.id,
        sender_role: "user",
        body,
      });
      if (messageError) throw new Error("Your withdrawal request could not be sent. Please try again.");

      toast.success("Withdrawal request sent to admin support. No balance was changed.");
      setAddress("");
      setQuantity("");
    } catch (requestError) {
      toast.error(requestError instanceof Error ? requestError.message : "Withdrawal request could not be sent.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-[900px] pb-24">
      <ScreenHeader title="Withdraw" back="/assets" />

      <form onSubmit={submit} className="space-y-4 p-4 sm:p-6">
        <section className="surface overflow-hidden rounded-2xl p-4 sm:p-5">
          <label className="mb-2 block text-xs font-medium uppercase tracking-wide text-muted-foreground" htmlFor="withdraw-currency">
            Currency
          </label>
          <div className="relative">
            <button
              id="withdraw-currency"
              type="button"
              aria-haspopup="listbox"
              aria-expanded={currencyMenuOpen}
              aria-controls="withdraw-currency-options"
              onClick={() => setCurrencyMenuOpen((open) => !open)}
              className="flex h-12 w-full items-center gap-3 rounded-xl bg-secondary px-4 text-left transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
            >
              <Wallet className="size-4 shrink-0 text-primary" />
              <span className="flex-1 text-sm font-semibold">{currency}</span>
              <ChevronDown className={`size-4 shrink-0 text-muted-foreground transition-transform ${currencyMenuOpen ? "rotate-180" : ""}`} />
            </button>
            {currencyMenuOpen && (
              <div
                id="withdraw-currency-options"
                role="listbox"
                aria-labelledby="withdraw-currency"
                className="absolute inset-x-0 top-full z-30 mt-2 max-h-64 overflow-y-auto rounded-2xl border border-border bg-popover p-2 shadow-xl"
              >
                {CURRENCIES.map((item) => (
                  <button
                    key={item}
                    type="button"
                    role="option"
                    aria-selected={currency === item}
                    onClick={() => {
                      setCurrency(item);
                      setCurrencyMenuOpen(false);
                    }}
                    className="flex w-full items-center justify-between rounded-xl px-4 py-3 text-left text-sm text-popover-foreground transition-colors hover:bg-accent"
                  >
                    {item}
                    {currency === item && <Check className="size-4 text-primary" />}
                  </button>
                ))}
              </div>
            )}
          </div>

          <label className="mb-2 mt-6 block text-sm font-medium" htmlFor="withdraw-address">
            Withdrawal address
          </label>
          <input
            id="withdraw-address"
            value={address}
            onChange={(event) => setAddress(event.target.value)}
            autoComplete="off"
            placeholder="Enter or paste wallet address"
            className="h-12 w-full rounded-xl bg-secondary px-4 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-primary"
          />
        </section>

        <section className="surface rounded-2xl p-4 sm:p-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <label className="text-sm font-medium" htmlFor="withdraw-quantity">Quantity</label>
            <span className="text-xs text-muted-foreground">
              Available: <span className="num text-foreground">{available.toLocaleString("en-US", { maximumFractionDigits: 8 })} {currency}</span>
            </span>
          </div>
          <div className="flex items-center rounded-xl bg-secondary px-4 focus-within:ring-1 focus-within:ring-primary">
            <input
              id="withdraw-quantity"
              type="number"
              min="0"
              max={available}
              step="any"
              inputMode="decimal"
              value={quantity}
              onChange={(event) => setQuantity(event.target.value)}
              placeholder="Enter quantity"
              className="h-12 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
            <span className="num px-2 text-sm text-muted-foreground">{currency}</span>
            <button
              type="button"
              onClick={() => setQuantity(available > 0 ? String(available) : "")}
              className="border-l border-border pl-3 text-sm font-semibold text-primary"
            >
              All
            </button>
          </div>
          <div className="mt-4 flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Handling fee</span>
            <span className="num">0 {currency}</span>
          </div>
        </section>

        <button type="submit" disabled={sending} className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60">
          {sending ? "Sending request…" : "Withdraw"} {!sending && <ArrowRight className="size-4" />}
        </button>

        <section className="surface rounded-2xl p-4 sm:p-5">
          <h2 className="mb-3 text-sm font-semibold">Please note</h2>
          <ul className="space-y-2 text-xs leading-relaxed text-muted-foreground">
            <li>Double-check that the wallet address is correct before submitting.</li>
            <li>Sending a digital currency to a non-matching address may cause permanent loss.</li>
            <li>Withdrawal fees, if any, are deducted from the withdrawal amount.</li>
          </ul>
        </section>
      </form>

      <BottomNav />
    </div>
  );
}
