import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

/**
 * Members sign in with a phone number only. Supabase credentials require an
 * email, so we derive a deterministic synthetic address from the normalized
 * phone number. Email-based password reset is therefore not available.
 */
export function normalizePhone(input: string) {
  return input.replace(/[^0-9]/g, "");
}

export function phoneToEmail(phone: string) {
  return `user-${normalizePhone(phone)}@members.novaterminal.app`;
}

export function useSession() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  return { session, loading };
}

export function useIsAdmin(userId?: string) {
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);

  useEffect(() => {
    if (!userId) {
      setIsAdmin(false);
      return;
    }
    let active = true;
    setIsAdmin(null);
    supabase
      .rpc("has_role", { _user_id: userId, _role: "admin" })
      .then(({ data, error }) => {
        if (!active) return;
        if (error) {
          console.error("Could not check the signed-in user's admin role:", error);
          setIsAdmin(false);
          return;
        }
        setIsAdmin(data === true);
      });
    return () => {
      active = false;
    };
  }, [userId]);

  return isAdmin;
}
