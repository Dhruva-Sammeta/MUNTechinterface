import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const AUTH_TIMEOUT_MS = 3500;

async function withTimeout<T>(promise: PromiseLike<T>, timeoutMs: number, message: string): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      Promise.resolve(promise),
      new Promise<T>((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error(message)), timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

export async function updateSession(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  // Public paths never require auth refresh; skipping remote auth checks here
  // prevents long stalls on slow/unreliable networks.
  const publicPaths = ["/", "/login", "/join", "/presentation", "/api"];
  const isPublicPath = publicPaths.some(
    (p) => pathname === p || pathname.startsWith(p + "/"),
  );
  if (isPublicPath) {
    return NextResponse.next({ request });
  }

  // Skip if Supabase is not configured (build time or missing env)
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_URL.includes("your-project-ref")
  ) {
    return NextResponse.next({ request });
  }

  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  let user: { id: string } | null = null;
  try {
    const userRes = await withTimeout(
      supabase.auth.getUser(),
      AUTH_TIMEOUT_MS,
      "Supabase auth timeout",
    );
    user = (userRes as any)?.data?.user || null;
  } catch {
    user = null;
  }

  // If not authenticated and not on a public path, redirect to login
  if (!user && !isPublicPath) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  // Role-based route protection
  if (user) {
    let delegate: { role?: string } | null = null;
    try {
      const delegateRes = await withTimeout(
        supabase
          .from("delegates")
          .select("role")
          .eq("user_id", user.id)
          .single(),
        AUTH_TIMEOUT_MS,
        "Role lookup timeout",
      );
      delegate = (delegateRes as any)?.data || null;
    } catch {
      // If role lookup fails, allow the page to load; page-level checks still guard UI actions.
      return supabaseResponse;
    }

    const role = delegate?.role || "delegate";

    // Admin routes
    if (pathname.startsWith("/admin") && role !== "admin") {
      const url = request.nextUrl.clone();
      url.pathname = "/delegate";
      return NextResponse.redirect(url);
    }

    // EB routes
    if (pathname.startsWith("/eb") && role !== "eb" && role !== "admin") {
      const url = request.nextUrl.clone();
      url.pathname = "/delegate";
      return NextResponse.redirect(url);
    }
  }

  return supabaseResponse;
}
