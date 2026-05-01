import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const ONBOARDING_COOKIE = "cj_onb";
const COOKIE_MAX_AGE    = 60 * 60 * 24 * 365; // 1 year

export async function proxy(request: NextRequest) {
  // Build a response we can mutate with cookie writes
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          // Keep the request cookies in sync (needed by Supabase SSR)
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // ── Get session (never use getSession() in middleware — use getUser()) ──────
  let user = null;
  try {
    const { data } = await supabase.auth.getUser();
    user = data.user;
  } catch {
    // Auth check failed — let the request through; page-level guards handle it
    return supabaseResponse;
  }

  const { pathname } = request.nextUrl;

  // ── Unauthenticated: / and /login are public; protect everything else ─────────
  if (!user) {
    if (
      pathname === "/" ||
      pathname.startsWith("/login") ||
      pathname.startsWith("/api/")
    ) {
      return supabaseResponse;
    }
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  // ── Authenticated on / → send to dashboard ───────────────────────────────────
  if (pathname === "/") {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }

  // ── Authenticated on /login → send to dashboard ──────────────────────────────
  if (pathname.startsWith("/login")) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }

  // ── Onboarding guard: only applies to /dashboard and /onboarding ─────────────
  // All other authenticated routes (market, settings, pricing, api/*) pass through.
  const isGuardedPage = pathname === "/dashboard" || pathname === "/onboarding";
  if (!isGuardedPage) return supabaseResponse;

  // ── Fast path: cookie already set → user confirmed as existing ───────────────
  // Cookie is set once after the first successful DB check and lasts 1 year.
  // This means zero DB queries on every subsequent page load.
  if (request.cookies.get(ONBOARDING_COOKIE)?.value === "1") {
    if (pathname === "/onboarding") {
      const url = request.nextUrl.clone();
      url.pathname = "/";
      return NextResponse.redirect(url);
    }
    return supabaseResponse;
  }

  // ── Slow path: DB check (runs at most once per device until cookie is set) ───
  try {
    const [profileRes, countRes] = await Promise.all([
      supabase
        .from("user_profiles")
        .select("onboarding_completed")
        .eq("user_id", user.id)
        .maybeSingle(),
      supabase
        .from("trades")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id),
    ]);

    // Existing user = has completed onboarding flag OR already has trades in DB
    const isExisting =
      !!(profileRes.data?.onboarding_completed) || (countRes.count ?? 0) > 0;

    if (isExisting) {
      // Stamp the cookie so we never hit the DB again for this device
      const cookieOpts = { maxAge: COOKIE_MAX_AGE, path: "/", sameSite: "lax" as const };

      if (pathname === "/onboarding") {
        // Existing user on onboarding → send to dashboard
        const url = request.nextUrl.clone();
        url.pathname = "/dashboard";
        const res = NextResponse.redirect(url);
        res.cookies.set(ONBOARDING_COOKIE, "1", cookieOpts);
        return res;
      }

      // Existing user on dashboard → allow through with cookie set
      supabaseResponse.cookies.set(ONBOARDING_COOKIE, "1", cookieOpts);
      return supabaseResponse;
    }

    // New user on dashboard → send to onboarding
    if (pathname === "/dashboard") {
      const url = request.nextUrl.clone();
      url.pathname = "/onboarding";
      return NextResponse.redirect(url);
    }

    // New user already on /onboarding → allow through
    return supabaseResponse;
  } catch {
    // DB check failed — let the request through; page-level guards handle it
    return supabaseResponse;
  }
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static  (static files)
     * - _next/image   (image optimisation)
     * - favicon.ico, robots.txt, sitemap.xml
     * - public assets with extensions (images, fonts, etc.)
     */
    "/((?!_next/static|_next/image|favicon\\.ico|robots\\.txt|sitemap\\.xml|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?|ttf|otf)).*)",
  ],
};
