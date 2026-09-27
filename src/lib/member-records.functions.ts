import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const ensureOwnMemberRecords = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: {
    phone: string;
    displayName?: string | null;
    serialNum?: string | null;
    createdAt?: string;
  }) => {
    if (!/^\+[1-9]\d{6,14}$/.test(input.phone)) {
      throw new Error("A valid international phone number is required.");
    }
    return input;
  })
  .handler(async ({ data, context }) => {
    const { data: currentProfile, error: profileReadError } = await context.supabase
      .from("profiles")
      .select("id")
      .eq("id", context.userId)
      .maybeSingle();
    if (profileReadError) {
      throw new Error("Could not check the member profile.");
    }

    const displayName = data.displayName?.trim() || null;
    const serialNum = data.serialNum?.trim() || null;
    const profileError = currentProfile
      ? (await context.supabase.from("profiles").update({
          phone: data.phone,
          ...(displayName ? { display_name: displayName } : {}),
          ...(serialNum ? { serial_num: serialNum } : {}),
        }).eq("id", context.userId)).error
      : (await context.supabase.from("profiles").insert({
          id: context.userId,
          phone: data.phone,
          display_name: displayName,
          serial_num: serialNum,
          ...(data.createdAt ? { created_at: data.createdAt } : {}),
        })).error;
    if (profileError) {
      console.error("Could not provision the signed-in member profile:", profileError);
      throw new Error("Could not save the account profile. Please retry after signing in.");
    }

    // Authenticated members can read their balance but cannot write it. Use
    // the service client only to insert their own missing zero-balance row.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error: balanceError } = await supabaseAdmin
      .from("user_balances")
      .upsert({ user_id: context.userId, usdt: 0 }, { onConflict: "user_id", ignoreDuplicates: true });
    if (balanceError) {
      console.error("Could not provision the signed-in member balance:", balanceError);
      throw new Error("Could not initialize the account balance. Please retry after signing in.");
    }

    return { success: true };
  });
