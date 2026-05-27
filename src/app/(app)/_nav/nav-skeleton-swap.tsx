"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { flushSync } from "react-dom";
import { usePathname } from "next/navigation";

import { pathnameToSkeleton } from "./pathname-to-skeleton";

type Pending = { target: string; skeleton: ReactNode };

/**
 * Wraps the (app) route group's children and instantly swaps them for
 * the target route's skeleton the moment a <Link> is clicked.
 *
 * Without this, Next.js shows the *previous* page until the new route
 * commits — over our Tanzania latency that's a ~600ms frozen-screen
 * window. With it, the click feels instant: the skeleton paints in the
 * same frame, then the real page replaces it when the server responds.
 *
 * Strategy: one delegated click listener on this div catches every
 * <a> click underneath. If the target is an in-app pathname, we paint
 * the matching skeleton synchronously via flushSync — Next's router
 * then takes over and navigates as usual. When usePathname() reflects
 * the new route, the skeleton is hidden (derived from state, no
 * effect-driven setState).
 *
 * See: plan file `peaceful-rolling-snail.md`.
 */
export function NavSkeletonSwap({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [pending, setPending] = useState<Pending | null>(null);

  // The skeleton is "showing" only while pending exists *and* the live
  // pathname hasn't caught up yet. Derived — no effect-driven setState.
  // Stale pending state lingers until the next click overwrites it, but
  // that's harmless since isShowing already filters it out.
  const isShowing = pending !== null && pending.target !== pathname;

  // Safety timeout: a failed or cancelled nav must never strand the
  // user on the fake skeleton. Resets every time a new click arms one.
  const safetyRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const armSafety = useCallback(() => {
    if (safetyRef.current) clearTimeout(safetyRef.current);
    safetyRef.current = setTimeout(() => {
      setPending(null);
      safetyRef.current = null;
    }, 5000);
  }, []);
  useEffect(() => {
    return () => {
      if (safetyRef.current) clearTimeout(safetyRef.current);
    };
  }, []);

  const handleClick = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      // Let the browser / Next handle modified clicks (open in new tab etc.)
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) {
        return;
      }

      const anchor = (event.target as HTMLElement | null)?.closest("a");
      if (!anchor) return;

      // External / new-tab / download / mailto / tel — let them pass.
      if (
        anchor.target === "_blank" ||
        anchor.hasAttribute("download") ||
        anchor.getAttribute("rel")?.includes("external")
      ) {
        return;
      }

      const href = anchor.getAttribute("href");
      if (!href || !href.startsWith("/")) return;

      // Strip query + hash; we only care about the route segment.
      const targetPathname = href.split("?")[0].split("#")[0];

      // Same-route nav (query-only change) keeps its existing
      // useTransition fade in the page itself — no full skeleton swap.
      if (targetPathname === pathname) return;

      const skeleton = pathnameToSkeleton(targetPathname);
      if (!skeleton) return; // routes opted out (e.g. "/")

      // flushSync forces React to paint the skeleton in this frame,
      // before Next's router microtask runs.
      flushSync(() => {
        setPending({ target: targetPathname, skeleton });
      });

      armSafety();
    },
    [pathname, armSafety],
  );

  return (
    <div onClickCapture={handleClick} className="contents">
      {isShowing ? pending!.skeleton : children}
    </div>
  );
}
