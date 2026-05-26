import { type NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "@/lib/supabase/env";

/**
 * T-031: Session refresh + route protection.
 *
 * Rules:
 *  - Public routes (login): accessible without auth; redirect to / if already authed.
 *  - All other routes: require auth; redirect to /login if not authed.
 *
 * Perf (D-040): the original implementation called `getUser()` on every
 * request, which is a ~300ms round-trip to the Supabase Auth server. With
 * asymmetric JWTs (the new sb_publishable_… key system per D-020) the token
 * signature is verifiable locally via `getClaims()` in ~5ms. We use the
 * cheap path on every request and only fall back to `getUser()` when the JWT
 * is within REFRESH_THRESHOLD_SEC of expiring — that's the one moment we
 * actually need the cookie rotation that `getUser()` triggers.
 *
 * Trust model: a session that's revoked server-side stays usable until the
 * JWT expires (default 1 hour). Acceptable for an internal-staff app; if we
 * ever need immediate revocation we rotate the JWT signing key.
 */

const PUBLIC_ROUTES = ["/login"];

// Refresh window: when `exp - now` drops below this, take the Auth-server
// round-trip to rotate cookies. 5 minutes gives plenty of slack on a 1-hour
// token and keeps the cost down to roughly one round-trip per session.
const REFRESH_THRESHOLD_SEC = 5 * 60;

function isPublic(pathname: string): boolean {
  return PUBLIC_ROUTES.some(
    (r) => pathname === r || pathname.startsWith(`${r}/`)
  );
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Build a mutable response that we'll pass cookies through.
  let response = NextResponse.next({ request });

  const supabase = createServerClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  const PERF_ENABLED =
    process.env.PERF_LOG === "1" ||
    process.env.PERF_LOG === "true" ||
    process.env.NODE_ENV !== "production";
  const perfStart = PERF_ENABLED ? performance.now() : 0;

  // Fast path: verify the JWT locally. No network call when the project is
  // on asymmetric JWTs (sb_publishable_…). getClaims() returns no claims for
  // missing / expired / tampered tokens.
  const { data: claimsData } = await supabase.auth.getClaims();
  const claims = claimsData?.claims;

  let authed = !!claims;
  let mode: "getClaims" | "getUser" = "getClaims";

  if (claims) {
    const expSec = typeof claims.exp === "number" ? claims.exp : 0;
    const nowSec = Math.floor(Date.now() / 1000);
    const remaining = expSec - nowSec;

    // Near-expiry refresh — the only path that talks to the Auth server.
    // getUser() triggers the SSR client's setAll() callback above, which
    // rotates the cookies onto the response.
    if (remaining < REFRESH_THRESHOLD_SEC) {
      mode = "getUser";
      const { data } = await supabase.auth.getUser();
      authed = !!data.user;
    }
  }

  if (PERF_ENABLED) {
    console.log(
      `[perf] middleware:auth ${Math.round(performance.now() - perfStart)}ms path=${pathname} mode=${mode}`,
    );
  }

  const pub = isPublic(pathname);

  // Already authenticated → bounce away from login.
  if (authed && pub) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  // Not authenticated → send to login.
  if (!authed && !pub) {
    const loginUrl = new URL("/login", request.url);
    // Preserve the original URL so we can redirect back after login (future).
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Match all paths except:
     * - Next.js internals (_next/static, _next/image)
     * - Static assets (favicon, images, svgs, fonts)
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|woff2?)$).*)",
  ],
};
