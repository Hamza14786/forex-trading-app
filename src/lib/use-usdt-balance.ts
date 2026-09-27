import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export function useUsdtBalance() {
  const [balance, setBalance] = useState(0);

  useEffect(() => {
    let active = true;
    let balanceChannel: ReturnType<typeof supabase.channel> | undefined;

    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) return;
      const userId = data.user.id;
      const { data: row } = await supabase
        .from("user_balances")
        .select("usdt")
        .eq("user_id", userId)
        .maybeSingle();
      if (!active) return;
      setBalance(row?.usdt ?? 0);
      balanceChannel = supabase
        .channel(`balance-action-${userId}`)
        .on("postgres_changes", {
          event: "*",
          schema: "public",
          table: "user_balances",
          filter: `user_id=eq.${userId}`,
        }, (payload) => {
          const next = payload.new as { usdt?: number };
          setBalance(next.usdt ?? 0);
        })
        .subscribe();
    });

    return () => {
      active = false;
      if (balanceChannel) void supabase.removeChannel(balanceChannel);
    };
  }, []);

  return balance;
}
