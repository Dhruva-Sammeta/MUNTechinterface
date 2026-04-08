import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function updateSession(request: NextRequest) {
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

  // Refresh session
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;

  // Public paths that don't require auth
  const publicPaths = ["/", "/login", "/join", "/presentation"];
  const isPublicPath = publicPaths.some(
    (p) => pathname === p || pathname.startsWith(p + "/"),
  );

  // If not authenticated and not on a public path, redirect to login
  if (!user && !isPublicPath) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  // Role-based route protection
  if (user) {
    const { data: delegate } = await supabase
      .from("delegates")
      .select("role")
      .eq("user_id", user.id)
      .single();

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
