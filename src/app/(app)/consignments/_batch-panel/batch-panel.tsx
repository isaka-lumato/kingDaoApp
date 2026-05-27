"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";

type Props = {
  inRef: string;
  children: React.ReactNode;
};

export default function BatchPanel({ inRef, children }: Props) {
  const router = useRouter();
  const params = useSearchParams();
  const pathname = usePathname();

  function close() {
    const next = new URLSearchParams(params?.toString() ?? "");
    next.delete("batch");
    next.delete("bc");
    next.delete("by");
    const qs = next.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") close();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params, pathname]);

  return (
    <div className="fixed inset-0 z-50">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={close}
        aria-hidden
      />
      <aside
        className="absolute right-0 top-0 h-full w-full max-w-md overflow-y-auto border-l border-border bg-card shadow-2xl"
        role="dialog"
        aria-label={`Batch ${inRef}`}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-card px-5 py-3">
          <div className="flex items-baseline gap-2">
            <span className="text-xs uppercase tracking-wider text-muted-foreground">
              In Ref
            </span>
            <span className="font-mono text-lg font-bold text-foreground">{inRef}</span>
          </div>
          <button
            type="button"
            onClick={close}
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            aria-label="Close batch panel"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              className="h-4 w-4"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="p-5">{children}</div>
      </aside>
    </div>
  );
}
