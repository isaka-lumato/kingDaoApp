"use client";

import { useState, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

/**
 * Client-side providers for the (app) route group (D-056).
 *
 * Mounts a single TanStack Query client. The client is created lazily inside
 * `useState` so it is stable across re-renders and there is exactly one
 * instance per browser tab (a fresh one per request on the server — the
 * standard Next.js App Router pattern; never a module-level singleton, which
 * would leak state across requests/users in the RSC runtime).
 *
 * Defaults are tuned for an internal, low-churn tool: data stays "fresh" for
 * 30s (so back/forward and re-filter hit the cache without a refetch), is kept
 * in memory for 5 min after going unused, and we don't refetch on window focus
 * (operators tab away constantly; a focus refetch would be noise, and Realtime
 * — D-057 — is the live-update path anyway).
 */
export default function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            gcTime: 5 * 60_000,
            refetchOnWindowFocus: false,
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}
