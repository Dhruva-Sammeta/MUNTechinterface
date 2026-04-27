"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function DelegateIndexPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function resolveWorkspaceRoute() {
      try {
        const supabase = createClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user?.id) {
          router.replace("/");
          return;
        }

        const { data: delegate, error: delegateError } = await supabase
          .from("delegates")
          .select("committee_id,role")
          .eq("user_id", user.id)
          .maybeSingle();

        if (delegateError) {
          throw new Error(delegateError.message);
        }

        if (!delegate?.committee_id) {
          if (!cancelled) {
            setError("No active committee assignment found for this account.");
            setLoading(false);
          }
          return;
        }

        const role = String((delegate as any).role || "delegate");
        if (role === "admin") {
          router.replace("/admin");
          return;
        }

        if (role === "eb") {
          router.replace(`/eb/${delegate.committee_id}`);
          return;
        }

        router.replace(`/delegate/${delegate.committee_id}`);
      } catch (err: any) {
        if (!cancelled) {
          setError(err?.message || "Unable to open your delegate workspace.");
          setLoading(false);
        }
      }
    }

    void resolveWorkspaceRoute();

    return () => {
      cancelled = true;
    };
  }, [router]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#040818] text-white p-4">
        <div className="rounded-2xl border border-white/10 bg-white/5 px-6 py-5 text-sm text-cyan-100/80">
          Preparing your committee workspace...
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#040818] text-white p-4">
      <div className="max-w-xl rounded-3xl border border-white/10 bg-white/5 p-10 shadow-[0_30px_120px_rgba(15,180,255,0.15)] backdrop-blur-md">
        <h1 className="text-3xl font-bold mb-4">Delegate Access</h1>
        <p className="mb-4 text-sm text-white/70">{error || "Unable to determine your delegate workspace."}</p>
        <div className="flex flex-col gap-3">
          <Link href="/" className="inline-flex items-center justify-center rounded-xl bg-sapphire-500 px-5 py-3 text-sm font-semibold text-white hover:bg-sapphire-400 transition">
            Return to login
          </Link>
        </div>
      </div>
    </div>
  );
}
