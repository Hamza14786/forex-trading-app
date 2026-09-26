import { Link } from "@tanstack/react-router";
import { ChevronLeft } from "lucide-react";
import type { ReactNode } from "react";

export function ScreenHeader({
  title,
  back,
  right,
}: {
  title: string;
  back?: string;
  right?: ReactNode;
}) {
  return (
    <header className="sticky top-0 z-30 grid grid-cols-[1fr_auto_1fr] items-center gap-2 border-b border-border bg-background/95 px-3 py-3 backdrop-blur">
      {back ? (
        <Link
          to={back}
          className="flex size-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          aria-label="Back"
        >
          <ChevronLeft className="size-5" />
        </Link>
      ) : (
        <span />
      )}
      <h1 className="truncate text-center text-base font-semibold">{title}</h1>
      <div className="flex justify-end">{right}</div>
    </header>
  );
}
