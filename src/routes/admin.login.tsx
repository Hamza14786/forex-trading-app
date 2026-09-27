import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { Loader2, ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Logo } from "@/components/Logo";

export const Route = createFileRoute("/admin/login")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Admin login — Polygon" },
      { name: "description", content: "Sign in to the Polygon admin dashboard." },
    ],
  }),
  component: AdminLoginPage,
});

async function hasAdminRole(userId: string) {
  const { data, error } = await supabase.rpc("has_role", {
    _user_id: userId,
    _role: "admin",
  });
  return !error && data === true;
}

function AdminLoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setBusy(true);

    const { data, error: signInError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (signInError || !data.user) {
      setBusy(false);
      setError("Email or password is incorrect.");
      return;
    }

    if (!(await hasAdminRole(data.user.id))) {
      await supabase.auth.signOut();
      setBusy(false);
      setError("This account does not have admin access.");
      return;
    }

    await navigate({ to: "/admin", replace: true });
    setBusy(false);
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-5 py-10 text-foreground">
      <div className="w-full max-w-sm">
        <div className="mb-7 flex justify-center">
          <Logo size={36} />
        </div>
        <section className="surface rounded-xl p-6 shadow-xl">
          <div className="mb-6 flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <ShieldCheck className="size-5" />
            </span>
            <div>
              <h1 className="text-lg font-semibold">Admin login</h1>
              <p className="text-sm text-muted-foreground">Sign in with your admin credentials.</p>
            </div>
          </div>

          <form onSubmit={submit} className="space-y-4">
            <label className="block">
              <span className="text-sm font-semibold">Email</span>
              <input
                type="email"
                autoComplete="username"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="Admin email"
                className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-3 text-sm outline-none focus-visible:ring-1 focus-visible:ring-primary"
              />
            </label>
            <label className="block">
              <span className="text-sm font-semibold">Password</span>
              <input
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Admin password"
                className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-3 text-sm outline-none focus-visible:ring-1 focus-visible:ring-primary"
              />
            </label>

            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}

            <button
              type="submit"
              disabled={busy}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary py-3 text-sm font-semibold text-primary-foreground transition-opacity disabled:opacity-60"
            >
              {busy && <Loader2 className="size-4 animate-spin" />}
              Sign in to admin
            </button>
          </form>
        </section>
      </div>
    </main>
  );
}
