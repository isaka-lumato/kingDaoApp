"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";

type Props = {
  inRef: string;
  clientId: string;
  year: number;
  className?: string;
};

export default function BatchLink({ inRef, clientId, year, className }: Props) {
  const router = useRouter();
  const params = useSearchParams();
  const pathname = usePathname();

  function open(e: React.MouseEvent) {
    e.stopPropagation();
    e.preventDefault();
    const next = new URLSearchParams(params?.toString() ?? "");
    next.set("batch", inRef);
    next.set("bc", clientId);
    next.set("by", String(year));
    router.push(`${pathname}?${next.toString()}`, { scroll: false });
  }

  return (
    <button
      type="button"
      onClick={open}
      className={
        className ??
        "inline-flex items-center gap-1 rounded border border-brand/30 bg-brand/10 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-brand hover:bg-brand/20 transition-colors"
      }
      title={`Open batch ${inRef}`}
    >
      {inRef}
    </button>
  );
}
