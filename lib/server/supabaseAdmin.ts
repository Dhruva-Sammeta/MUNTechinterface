import { createClient, type User } from "@supabase/supabase-js";

export function createSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error("Supabase admin env vars are not configured");
  }

  return createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export interface AdminAuthContext {
  user: User;
  delegateId: string | null;
}

export async function requireAdminFromRequest(req: Request): Promise<AdminAuthContext> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    throw new Error("UNAUTHORIZED");
  }

  const token = authHeader.replace("Bearer ", "").trim();
  if (!token) {
    throw new Error("UNAUTHORIZED");
  }

  const supabaseAdmin = createSupabaseAdmin();

  const {
    data: { user },
    error: authError,
  } = await supabaseAdmin.auth.getUser(token);

  if (authError || !user) {
    throw new Error("UNAUTHORIZED");
  }

  const { data: delegate, error: delegateError } = await supabaseAdmin
    .from("delegates")
    .select("id,role")
    .eq("user_id", user.id)
    .maybeSingle();

  if (delegateError || delegate?.role !== "admin") {
    throw new Error("FORBIDDEN");
  }

  return { user, delegateId: delegate?.id ?? null };
}
