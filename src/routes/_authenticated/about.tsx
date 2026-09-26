import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import { BottomNav } from "@/components/BottomNav";
import { ScreenHeader } from "@/components/ScreenHeader";
import { DOCS } from "@/lib/docs";

export const Route = createFileRoute("/_authenticated/about")({
  head: () => ({
    meta: [
      { title: "About us — Polyygony" },
      { name: "description", content: "User agreement, privacy policy, legal notices and company information." },
      { property: "og:title", content: "About us — Polyygony" },
      { property: "og:description", content: "Policies and company information for Polyygony." },
    ],
  }),
  component: AboutPage,
});

function AboutPage() {
  return (
    <div className="mx-auto w-full max-w-[1500px] pb-24">
      <ScreenHeader title="About us" back="/" />
      <div className="space-y-3 p-4">
        {Object.entries(DOCS).map(([slug, doc]) => (
          <Link
            key={slug}
            to="/about/$doc"
            params={{ doc: slug }}
            className="surface flex items-center justify-between px-4 py-4 transition-colors hover:bg-elevated"
          >
            <span className="text-sm font-medium">{doc.title}</span>
            <ChevronRight className="size-4 text-muted-foreground" />
          </Link>
        ))}
      </div>
      <BottomNav />
    </div>
  );
}
