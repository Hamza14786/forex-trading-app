import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const setRegisteredUserPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { userId: string; newPassword: string }) => {
    if (!/^[0-9a-f-]{36}$/i.test(input.userId)) {
      throw new Error("Select a valid registered user.");
    }
    if (input.newPassword.length < 8 || input.newPassword.length > 72) {
      throw new Error("Password must be between 8 and 72 characters.");
    }
    return input;
  })
  .handler(async ({ data, context }) => {
    const { data: isAdmin, error: roleError } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (roleError || !isAdmin) {
      throw new Error("Admin access required.");
    }

    const { data: profile, error: profileError } = await context.supabase
      .from("profiles")
      .select("id")
      .eq("id", data.userId)
      .maybeSingle();
    if (profileError || !profile) {
      throw new Error("Registered user not found.");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(data.userId, {
      password: data.newPassword,
    });
    if (updateError) {
      console.error("Could not update registered user's password:", updateError);
      throw new Error("Password could not be updated. Please try again.");
    }

    return { success: true };
  });
