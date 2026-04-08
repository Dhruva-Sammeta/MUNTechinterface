import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  const cookieStore = await cookies();

  // Graceful fallback if env vars aren't configured yet
  const supabaseUrl =
    url && !url.includes("your-project-ref")
      ? url
      : "https://placeholder.supabase.co";
  const supabaseKey =
    key && key !== "your-anon-key-here" ? key : "placeholder-key";

  return createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        } catch {
          // The `setAll` method is called from a Server Component.
          // This can be ignored if middleware refreshes user sessions.
        }
      },
    },
  });
}
