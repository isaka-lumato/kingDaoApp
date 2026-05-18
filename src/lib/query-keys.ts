/**
 * Centralized TanStack Query keys. Every queryKey in the app must reference
 * one of these — never inline literal arrays. This keeps invalidation
 * tractable and refactors safe.
 */

export const queryKeys = {
  consignments: {
    all: ["consignments"] as const,
    list: (filters?: Record<string, unknown>) =>
      [...queryKeys.consignments.all, "list", filters ?? {}] as const,
    detail: (id: string) => [...queryKeys.consignments.all, "detail", id] as const,
    pipeline: (year: number) =>
      [...queryKeys.consignments.all, "pipeline", year] as const,
    inbox: (userId: string) =>
      [...queryKeys.consignments.all, "inbox", userId] as const,
  },
  clients: {
    all: ["clients"] as const,
    list: () => [...queryKeys.clients.all, "list"] as const,
    detail: (id: string) => [...queryKeys.clients.all, "detail", id] as const,
  },
  icds: {
    all: ["icds"] as const,
    list: () => [...queryKeys.icds.all, "list"] as const,
  },
  efd: {
    all: ["efd"] as const,
    list: () => [...queryKeys.efd.all, "list"] as const,
    detail: (id: string) => [...queryKeys.efd.all, "detail", id] as const,
  },
  permissions: {
    me: () => ["permissions", "me"] as const,
  },
  user: {
    me: () => ["user", "me"] as const,
  },
} as const;
