import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type UsdtBalances = { spot: number; futures: number };

export function useUsdtBalances() {
  const [balances, setBalances] = useState<UsdtBalances>({ spot: 0, futures: 0 });

  useEffect(() => {
    let active = true;
    let balanceChannel: ReturnType<typeof supabase.channel> | undefined;

    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) return;
      const userId = data.user.id;
      const { data: row, error } = await supabase
        .from("user_balances")
        .select("usdt, futures_usdt")
        .eq("user_id", userId)
        .maybeSingle();
      if (!active) return;
      if (error) {
        // Keep showing the Spot balance until the Futures-account migration is applied.
        const { data: spotRow } = await supabase
          .from("user_balances")
          .select("usdt")
          .eq("user_id", userId)
          .maybeSingle();
        if (!active) return;
        setBalances((current) => ({ spot: Number(spotRow?.usdt) || 0, futures: current.futures }));
      } else {
        setBalances({ spot: Number(row?.usdt) || 0, futures: Number(row?.futures_usdt) || 0 });
      }
      balanceChannel = supabase
        .channel(`account-balances-${userId}`)
        .on("postgres_changes", {
          event: "*",
          schema: "public",
          table: "user_balances",
          filter: `user_id=eq.${userId}`,
        }, (payload) => {
          const next = payload.new as { usdt?: number; futures_usdt?: number };
          setBalances((current) => ({
            spot: next.usdt === undefined ? current.spot : Number(next.usdt) || 0,
            futures: next.futures_usdt === undefined ? current.futures : Number(next.futures_usdt) || 0,
          }));
        })
        .subscribe();
    });

    return () => {
      active = false;
      if (balanceChannel) void supabase.removeChannel(balanceChannel);
    };
  }, []);

  return balances;
}
