import { createFileRoute } from "@tanstack/react-router";
import { BottomNav } from "@/components/BottomNav";
import { ScreenHeader } from "@/components/ScreenHeader";
import { DOCS } from "@/lib/docs";

export const Route = createFileRoute("/_authenticated/about/$doc")({
  head: () => ({
    meta: [
      { title: "Legal & company information — Polyygony" },
      { name: "description", content: "Read the Polyygony user agreement, privacy policy and legal notices." },
      { property: "og:title", content: "Legal & company information — Polyygony" },
      { property: "og:description", content: "Polyygony policies in full." },
    ],
  }),
  component: DocPage,
});

function DocPage() {
  const { doc } = Route.useParams();
  const entry = DOCS[doc];

  return (
    <div className="mx-auto w-full max-w-[1500px] pb-24">
      <ScreenHeader title={entry?.title ?? "Not found"} back="/about" />
      <div className="space-y-4 p-4 text-sm leading-relaxed text-muted-foreground">
        {entry ? (
          entry.body.map((p) => <p key={p}>{p}</p>)
        ) : (
          <p>This document is not available.</p>
        )}
      </div>
      <BottomNav />
    </div>
  );
}
