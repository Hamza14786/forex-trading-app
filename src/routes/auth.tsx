import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { normalizePhone, phoneToEmail } from "@/lib/auth";
import { COUNTRY_CALLING_CODES } from "@/lib/country-calling-codes";
import { Logo } from "@/components/Logo";

export const Route = createFileRoute("/auth")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Sign in — Polyygony" },
      { name: "description", content: "Sign in to Polyygony with your mobile number to trade spot and futures markets." },
      { property: "og:title", content: "Sign in — Polyygony" },
      { property: "og:description", content: "Access your Polyygony trading account." },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [country, setCountry] = useState("Pakistan");
  const countryCode = COUNTRY_CALLING_CODES.find(([name]) => name === country)?.[1] ?? "+92";
  const [countryQuery, setCountryQuery] = useState("");
  const [countryDropdownOpen, setCountryDropdownOpen] = useState(false);
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [serialNum, setSerialNum] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const matchingCountries = COUNTRY_CALLING_CODES.filter(([name, code]) =>
    `${name} ${code}`.toLowerCase().includes(countryQuery.trim().toLowerCase()),
  ).slice(0, 12);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/", replace: true });
    });
  }, [navigate]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    const digits = normalizePhone(phone);
    const fullPhone = `${countryCode}${digits}`;
    if (digits.length < 7 || normalizePhone(fullPhone).length > 15) {
      setError("Enter a valid mobile number.");
      return;
    }
    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    if (mode === "register" && password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    if (mode === "register" && !serialNum.trim()) {
      setError("Enter your serial number.");
      return;
    }
    setBusy(true);
    const email = phoneToEmail(fullPhone);

    if (mode === "register") {
      const { data, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: window.location.origin,
          data: { serial_num: serialNum.trim() },
        },
      });
      if (signUpError) {
        setBusy(false);
        setError(signUpError.message);
        return;
      }
      if (data.user) {
        await supabase.from("profiles").insert({ id: data.user.id, phone: fullPhone });
      }
      if (!data.session) {
        setBusy(false);
        setNotice("Account created. You can sign in now.");
        setMode("login");
        return;
      }
      setBusy(false);
      navigate({ to: "/", replace: true });
      return;
    }

    const legacyEmails = [`${normalizePhone(fullPhone)}@members.novaterminal.app`];
    if (countryCode === "+91") {
      // Older Indian accounts omitted the country prefix when they were created.
      legacyEmails.push(`${digits}@members.novaterminal.app`);
    }

    let { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    for (const legacyEmail of legacyEmails) {
      if (!signInError) break;
      const legacySignIn = await supabase.auth.signInWithPassword({ email: legacyEmail, password });
      signInError = legacySignIn.error;
    }
    setBusy(false);
    if (signInError) {
      setError("Mobile number or password is incorrect.");
      return;
    }
    navigate({ to: "/", replace: true });
  }

  return (
    <main className="relative isolate flex min-h-screen flex-col items-center justify-center overflow-x-hidden px-5 py-10">
      <TradingBackdrop />
      <div className="relative z-10 w-full max-w-sm">
        <div className="mb-8 flex justify-center">
          <Logo size={36} />
        </div>

        <div className="rounded-xl border border-border/70 bg-background/25 p-5 shadow-2xl backdrop-blur-md">
          <div className="mb-5 grid grid-cols-2 gap-1 rounded-lg bg-secondary p-1 text-sm">
            {(["login", "register"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => {
                  setMode(m);
                  setError(null);
                }}
                className={`rounded-md py-2 font-medium transition-colors ${
                  mode === m ? "bg-primary text-primary-foreground" : "text-muted-foreground"
                }`}
              >
                {m === "login" ? "Login" : "Register"}
              </button>
            ))}
          </div>

          <form onSubmit={submit} className="space-y-4">
            <label className="block">
              <span className="text-sm font-semibold text-foreground">Mobile</span>
              <div className="mt-1 flex items-center gap-2 border-b border-input pb-2">
                <div className="relative w-[44%] shrink-0">
                  <input
                    role="combobox"
                    aria-label="Search country calling code"
                    aria-autocomplete="list"
                    aria-expanded={countryDropdownOpen}
                    aria-controls="country-calling-code-options"
                    value={countryDropdownOpen ? countryQuery : `${countryCode} ${country}`}
                    onFocus={() => {
                      setCountryQuery("");
                      setCountryDropdownOpen(true);
                    }}
                    onClick={() => {
                      if (!countryDropdownOpen) {
                        setCountryQuery("");
                        setCountryDropdownOpen(true);
                      }
                    }}
                    onBlur={() => setCountryDropdownOpen(false)}
                    onChange={(e) => {
                      setCountryQuery(e.target.value);
                      setCountryDropdownOpen(true);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Escape") setCountryDropdownOpen(false);
                      if (e.key === "Enter" && matchingCountries[0]) {
                        e.preventDefault();
                        setCountry(matchingCountries[0][0]);
                        setCountryQuery("");
                        setCountryDropdownOpen(false);
                      }
                    }}
                    className="num w-full rounded bg-transparent px-1 py-2 text-xs font-medium text-foreground outline-none focus-visible:ring-1 focus-visible:ring-primary"
                  />
                  {countryDropdownOpen && (
                    <div
                      id="country-calling-code-options"
                      role="listbox"
                      className="absolute left-0 top-full z-50 mt-1 max-h-56 w-64 max-w-[80vw] overflow-y-auto rounded-lg border border-border bg-popover p-1 shadow-xl"
                    >
                      {matchingCountries.length ? (
                        matchingCountries.map(([name, code]) => (
                          <button
                            key={`${name}-${code}`}
                            type="button"
                            role="option"
                            aria-selected={country === name}
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => {
                              setCountry(name);
                              setCountryQuery("");
                              setCountryDropdownOpen(false);
                            }}
                            className="w-full rounded px-3 py-2 text-left text-xs text-popover-foreground hover:bg-accent"
                          >
                            {name} <span className="num text-muted-foreground">{code}</span>
                          </button>
                        ))
                      ) : (
                        <p className="px-3 py-2 text-xs text-muted-foreground">No countries found.</p>
                      )}
                    </div>
                  )}
                </div>
                <input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  inputMode="tel"
                  required
                  placeholder="Please enter your phone number"
                  className={`num w-full rounded px-2 py-2 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-primary ${
                    phone ? "bg-muted text-foreground" : "bg-transparent"
                  }`}
                />
              </div>
            </label>

            <label className="block">
              <span className="text-sm font-semibold text-foreground">Password</span>
              <input
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                type="password"
                required
                placeholder="Please enter a password"
                className={`mt-1 w-full rounded border-b border-input px-2 py-2 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-primary ${
                  password ? "bg-muted text-foreground" : "bg-transparent"
                }`}
              />
            </label>

            {mode === "register" && (
              <>
                <label className="block">
                  <span className="text-sm font-semibold text-foreground">Confirm password</span>
                  <input
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    type="password"
                    required
                    placeholder="Please confirm your password"
                    className={`mt-1 w-full rounded border-b border-input px-2 py-2 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-primary ${
                      confirmPassword ? "bg-muted text-foreground" : "bg-transparent"
                    }`}
                  />
                </label>

                <label className="block">
                  <span className="text-sm font-semibold text-foreground">Serial num</span>
                  <input
                    value={serialNum}
                    onChange={(e) => setSerialNum(e.target.value)}
                    required
                    placeholder="Please enter your serial number"
                    className={`mt-1 w-full rounded border-b border-input px-2 py-2 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-primary ${
                      serialNum ? "bg-muted text-foreground" : "bg-transparent"
                    }`}
                  />
                </label>
              </>
            )}

            {error && <p className="text-xs text-destructive">{error}</p>}
            {notice && <p className="text-xs text-up">{notice}</p>}

            <button
              type="submit"
              disabled={busy}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary py-3 text-sm font-semibold text-primary-foreground transition-opacity disabled:opacity-60"
            >
              {busy && <Loader2 className="size-4 animate-spin" />}
              {mode === "login" ? "Login" : "Create account"}
            </button>
          </form>
        </div>

        <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
          <button
            type="button"
            onClick={() => setNotice("Contact live chat support to reset your password.")}
            className="text-primary"
          >
            Forgot Password?
          </button>
          <span>
            No account?{" "}
            <button type="button" onClick={() => setMode("register")} className="text-primary">
              Register Now
            </button>
          </span>
        </div>
      </div>
    </main>
  );
}

function TradingBackdrop() {
  const candles = [
    [80, 440, 48, 118, true], [145, 405, 56, 128, false], [210, 420, 42, 102, true],
    [275, 354, 64, 146, true], [340, 378, 48, 110, false], [405, 310, 72, 156, true],
    [470, 330, 52, 120, false], [535, 260, 68, 148, true], [600, 280, 50, 116, true],
    [665, 220, 64, 142, false], [730, 240, 56, 126, true], [795, 176, 74, 160, true],
    [860, 194, 48, 108, false], [925, 138, 66, 146, true], [990, 158, 48, 112, false],
    [1055, 104, 62, 138, true], [1120, 122, 48, 108, true], [1185, 74, 60, 132, false],
    [1250, 92, 52, 116, true], [1315, 48, 66, 144, true],
  ] as const;
  const volumes = [32, 52, 38, 72, 44, 84, 56, 95, 50, 76, 64, 108, 58, 90, 48, 82, 54, 100, 62, 88];

  return (
    <svg
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 h-full w-full opacity-55"
      viewBox="0 0 1440 900"
      preserveAspectRatio="xMidYMid slice"
    >
      <defs>
        <linearGradient id="chart-wash" x1="0" x2="1" y1="0" y2="1">
          <stop stopColor="var(--up)" stopOpacity=".12" />
          <stop offset=".55" stopColor="var(--background)" stopOpacity=".02" />
          <stop offset="1" stopColor="var(--primary)" stopOpacity=".08" />
        </linearGradient>
        <linearGradient id="chart-dim" x1="0" x2="0" y1="0" y2="1">
          <stop stopColor="var(--background)" stopOpacity=".08" />
          <stop offset="1" stopColor="var(--background)" stopOpacity=".78" />
        </linearGradient>
        <filter id="chart-glow" x="-20%" y="-40%" width="140%" height="180%">
          <feGaussianBlur stdDeviation="7" />
        </filter>
      </defs>
      <path d="M0 0h1440v900H0z" fill="url(#chart-wash)" />
      {[100, 200, 300, 400, 500, 600, 700, 800].map((y) => (
        <path key={`h${y}`} d={`M0 ${y}H1440`} stroke="var(--foreground)" strokeOpacity=".10" strokeDasharray="4 10" />
      ))}
      {[120, 240, 360, 480, 600, 720, 840, 960, 1080, 1200, 1320].map((x) => (
        <path key={`v${x}`} d={`M${x} 0V900`} stroke="var(--foreground)" strokeOpacity=".07" strokeDasharray="4 10" />
      ))}
      <path
        d="M35 548 108 512 173 528 238 467 303 489 368 420 433 448 498 378 563 394 628 334 693 353 758 300 823 315 888 248 953 273 1018 218 1083 239 1148 182 1213 202 1278 139 1343 158 1405 112"
        fill="none" stroke="var(--up)" strokeOpacity=".28" strokeWidth="20" filter="url(#chart-glow)"
      />
      <path
        d="M35 548 108 512 173 528 238 467 303 489 368 420 433 448 498 378 563 394 628 334 693 353 758 300 823 315 888 248 953 273 1018 218 1083 239 1148 182 1213 202 1278 139 1343 158 1405 112"
        fill="none" stroke="var(--up)" strokeOpacity=".7" strokeWidth="2.5"
      />
      {candles.map(([x, y, h, wick, rising]) => (
        <g key={x} stroke={rising ? "var(--up)" : "var(--down)"} strokeWidth="2">
          <path d={`M${x + 12} ${y - wick / 2}V${y + wick / 2}`} />
          <rect x={x} y={y} width="24" height={h} rx="2" fill={rising ? "var(--up)" : "var(--down)"} fillOpacity=".55" />
        </g>
      ))}
      {volumes.map((height, i) => (
        <rect
          key={`vol-${i}`}
          x={80 + i * 65}
          y={830 - height}
          width="24"
          height={height}
          rx="2"
          fill={i % 4 === 1 ? "var(--down)" : "var(--up)"}
          fillOpacity=".22"
        />
      ))}
      <path d="M0 0h1440v900H0z" fill="url(#chart-dim)" />
    </svg>
  );
}
