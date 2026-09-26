import { Link } from "@tanstack/react-router";
import { Home, CandlestickChart, Repeat, Wallet } from "lucide-react";

const items = [
  { to: "/", label: "Home", icon: Home },
  { to: "/spot", label: "Spot", icon: CandlestickChart },
  { to: "/futures", label: "Futures", icon: Repeat },
  { to: "/assets", label: "Assets", icon: Wallet },
] as const;

export function BottomNav() {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card/95 backdrop-blur">
      <div className="mx-auto grid w-full max-w-[1500px] grid-cols-4">
        {items.map(({ to, label, icon: Icon }) => (
          <Link
            key={to}
            to={to}
            activeOptions={{ exact: to === "/" }}
            className="flex flex-col items-center gap-1 py-2.5 text-xs text-muted-foreground transition-colors data-[status=active]:text-primary"
          >
            <Icon className="size-5" />
            {label}
          </Link>
        ))}
      </div>
    </nav>
  );
}
