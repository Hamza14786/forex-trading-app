import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Gift, HelpCircle, Headphones, UserRound } from "lucide-react";
import { useMarket, fmt } from "@/lib/market";
import { Change } from "@/components/Amount";
import { BottomNav } from "@/components/BottomNav";
import { Logo } from "@/components/Logo";
import { supabase } from "@/integrations/supabase/client";
import banner1 from "@/assets/banner-1.jpg";
import banner2 from "@/assets/banner-2.jpg";

export const Route = createFileRoute("/_authenticated/")({
  head: () => ({
    meta: [
      { title: "Markets — Polygon" },
      { name: "description", content: "Live simulated crypto markets, promotions and support on Polygon." },
      { property: "og:title", content: "Markets — Polygon" },
      { property: "og:description", content: "Live simulated crypto markets and trading shortcuts." },
    ],
  }),
  component: HomePage,
});

const banners = [banner1, banner2];

function HomePage() {
  const { list } = useMarket();
  const [slide, setSlide] = useState(0);
  const [account, setAccount] = useState("");
  const [unreadSupportMessages, setUnreadSupportMessages] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setSlide((s) => (s + 1) % banners.length), 5000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    let active = true;
    let conversationChannel: ReturnType<typeof supabase.channel> | undefined;
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) return;
      const [{ data: profile }, { data: conversation }] = await Promise.all([
        supabase.from("profiles").select("phone").eq("id", data.user.id).maybeSingle(),
        supabase.from("conversations").select("unread_for_user").eq("user_id", data.user.id).maybeSingle(),
      ]);
      if (!active) return;
      setAccount(profile?.phone ?? data.user.email?.split("@")[0] ?? "");
      setUnreadSupportMessages(conversation?.unread_for_user ?? 0);
      conversationChannel = supabase
        .channel(`member-support-unread-${data.user.id}`)
        .on("postgres_changes", {
          event: "*",
          schema: "public",
          table: "conversations",
          filter: `user_id=eq.${data.user.id}`,
        }, (payload) => {
          const row = payload.new as { unread_for_user?: number };
          setUnreadSupportMessages(row.unread_for_user ?? 0);
        })
        .subscribe();
    });
    return () => {
      active = false;
      if (conversationChannel) void supabase.removeChannel(conversationChannel);
    };
  }, []);

  const featured = list.slice(0, 3);

  function CoinBadge({ symbol }: { symbol: string }) {
    const key = symbol.toLowerCase();
    return (
      <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full border border-white/10 bg-white/5 p-1 shadow-inner">
        <img
          src={`https://assets.coincap.io/assets/icons/${key}@2x.png`}
          alt={`${symbol} logo`}
          className="h-full w-full object-contain"
          loading="lazy"
          onError={(event) => { event.currentTarget.style.display = "none"; }}
        />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[1500px] pb-24">
      <header className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-3">
        <div className="flex min-w-0 items-center gap-2 text-sm text-muted-foreground">
          <UserRound className="size-5 shrink-0" />
          <span className="num truncate">{account || "Member"}</span>
        </div>
        <Logo />
      </header>

      <div className="px-4">
        <div className="relative overflow-hidden rounded-xl border border-border">
          {banners.map((src, i) => (
            <img
              key={src}
              src={src}
              alt="Promotion"
              className={`h-32 w-full object-cover transition-opacity duration-700 sm:h-44 ${
                i === slide ? "opacity-100" : "absolute inset-0 opacity-0"
              }`}
            />
          ))}
          <div className="absolute bottom-2 left-1/2 flex -translate-x-1/2 gap-1.5">
            {banners.map((src, i) => (
              <span
                key={src}
                className={`size-1.5 rounded-full ${i === slide ? "bg-primary" : "bg-foreground/40"}`}
              />
            ))}
          </div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-3 px-4">
        <Shortcut to="/about" icon={<Gift className="size-5" />} label="Promotion" />
        <Shortcut to="/about" icon={<HelpCircle className="size-5" />} label="About us" />
        <Shortcut
          to="/chat"
          icon={<Headphones className="size-5" />}
          label="Live chat"
          unreadCount={unreadSupportMessages}
        />
      </div>

      <section className="mt-4 space-y-2 px-4">
        {list.map((t) => (
          <Link
            key={t.symbol}
            to="/spot"
            search={{ pair: t.symbol }}
            className="surface grid grid-cols-[40px_minmax(0,1fr)_auto_auto] items-center gap-3 px-4 py-3 transition-colors hover:bg-elevated sm:grid-cols-[64px_minmax(0,1fr)_1fr_1fr] sm:gap-4"
          >
            <div className="flex justify-center">
              <CoinBadge symbol={t.base} />
            </div>
            <div className="min-w-0 text-center">
              <p className="truncate text-sm font-semibold">{t.symbol}</p>
              <p className="num text-xs text-muted-foreground">VOL {t.volume.toLocaleString("en-US")}</p>
            </div>

            <span className={`num justify-self-center text-sm font-semibold ${t.changePct >= 0 ? "text-up" : "text-down"}`}>
              {fmt(t.price, t.decimals)}
            </span>

            <span className="justify-self-end sm:justify-self-end">
              <Change value={t.changePct} />
            </span>
          </Link>
        ))}
      </section>

      <div className="mt-4 grid grid-cols-3 gap-3 px-4">
        {featured.map((t) => (
          <div key={t.symbol} className="surface p-3 text-center">
            <p className="truncate text-xs text-muted-foreground">{t.symbol}</p>
            <Change value={t.changePct} />
            <p className={`num mt-1 text-sm font-semibold ${t.changePct >= 0 ? "text-up" : "text-down"}`}>
              {fmt(t.price, t.decimals)}
            </p>
          </div>
        ))}
      </div>

      <BottomNav />
    </div>
  );
}

function Shortcut({ to, icon, label, unreadCount = 0 }: { to: string; icon: React.ReactNode; label: string; unreadCount?: number }) {
  return (
    <Link
      to={to}
      className="surface flex flex-col items-center gap-2 py-4 text-xs text-muted-foreground transition-colors hover:bg-elevated hover:text-foreground"
    >
      <span className="relative text-primary">
        {icon}
        {unreadCount > 0 && (
          <span className="absolute -right-3 -top-2 flex min-w-4 items-center justify-center rounded-full bg-destructive px-1 py-0.5 text-[9px] font-bold text-destructive-foreground">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </span>
      {label}
    </Link>
  );
}
