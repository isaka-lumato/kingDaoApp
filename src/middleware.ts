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
 * IMPORTANT: getUser() must be called before any redirect logic to ensure the
 * session cookie is always refreshed. This is the Supabase SSR pattern.
 */

const PUBLIC_ROUTES = ["/login"];

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

  // MUST call getUser() before any redirect — refreshes the session token.
  // Perf: this is a round-trip to the Supabase Auth server (not just DB) and
  // is suspected to be a major contributor to navigation latency. Timed here
  // so we can see it in the server logs when PERF_LOG is on.
  const perfStart =
    process.env.PERF_LOG === "1" || process.env.PERF_LOG === "true" || process.env.NODE_ENV !== "production"
      ? performance.now()
      : null;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (perfStart !== null) {
    console.log(
      `[perf] middleware:getUser ${Math.round(performance.now() - perfStart)}ms path=${pathname}`,
    );
  }

  const authed = !!user;
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
