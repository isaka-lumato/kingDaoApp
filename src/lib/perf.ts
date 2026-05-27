import "server-only";

/**
 * Tiny server-side timing helper for perf diagnosis.
 *
 * Usage:
 *   const t = perfTimer("dashboard");
 *   t.mark("fanout-start");
 *   await Promise.all([...]);
 *   t.mark("fanout-end");
 *   t.end();
 *
 * Or for a single block:
 *   await time("dashboard:fanout", async () => Promise.all([...]));
 *
 * Logs to stderr only when `PERF_LOG` env var is truthy, so it's safe to leave
 * the calls in place — flip the env var on/off without touching code.
 *
 * Output format (one line per timer end):
 *   [perf] dashboard total=412ms | getUser=187 perms=98 fanout=120
 */

const ENABLED =
  process.env.PERF_LOG === "1" ||
  process.env.PERF_LOG === "true" ||
  process.env.NODE_ENV !== "production";

type Mark = { label: string; at: number };

export function perfTimer(name: string) {
  const start = performance.now();
  const marks: Mark[] = [];

  return {
    mark(label: string) {
      if (!ENABLED) return;
      marks.push({ label, at: performance.now() });
    },
    end(extra?: Record<string, number | string>) {
      if (!ENABLED) return;
      const total = Math.round(performance.now() - start);
      const segments: string[] = [];
      let prev = start;
      for (const m of marks) {
        segments.push(`${m.label}=${Math.round(m.at - prev)}`);
        prev = m.at;
      }
      const extras = extra
        ? " | " +
          Object.entries(extra)
            .map(([k, v]) => `${k}=${v}`)
            .join(" ")
        : "";
      console.log(
        `[perf] ${name} total=${total}ms${
          segments.length ? " | " + segments.join(" ") : ""
        }${extras}`,
      );
    },
  };
}

/**
 * Wrap a single async block. Returns whatever the block returns.
 */
export async function time<T>(
  label: string,
  fn: () => Promise<T>,
): Promise<T> {
  if (!ENABLED) return fn();
  const start = performance.now();
  try {
    return await fn();
  } finally {
    const ms = Math.round(performance.now() - start);
    console.log(`[perf] ${label} ${ms}ms`);
  }
}
