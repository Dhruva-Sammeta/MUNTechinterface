"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { motion } from "framer-motion";
import { Diamond, ArrowRight } from "lucide-react";
import Link from "next/link";
import type { Committee } from "@/lib/database.types";

export default function PresentationIndexPage() {
  const [committees, setCommittees] = useState<Committee[]>([]);

  useEffect(() => {
    const supabase = createClient();
    supabase
      .from("committees")
      .select("*")
      .order("name")
      .then(({ data }) => {
        if (data) setCommittees(data as Committee[]);
      });
  }, []);

  const themeColors: Record<string, string> = {
    default: "var(--color-sapphire-500)",
    pirate: "var(--color-pirate-gold)",
    flame: "var(--color-flame-core)",
  };

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-6"
      style={{ background: "var(--color-bg-primary)" }}
    >
      <Diamond
        size={32}
        style={{ color: "var(--color-sapphire-500)" }}
        className="mb-4"
      />
      <h1
        className="text-2xl font-bold mb-1"
        style={{ fontFamily: "var(--font-heading)" }}
      >
        Presentation Mode
      </h1>
      <p className="text-sm mb-8" style={{ color: "var(--color-text-muted)" }}>
        Select a committee for the projector display
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 w-full max-w-3xl">
        {committees.map((c, i) => (
          <motion.div
            key={c.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
          >
            <Link
              href={`/presentation/${c.id}`}
              className="glass-card p-5 block hover:scale-[1.02] transition-transform"
            >
              <p
                className="text-sm font-bold"
                style={{
                  color: themeColors[c.theme] || themeColors.default,
                  fontFamily: "var(--font-heading)",
                }}
              >
                {c.short_name}
              </p>
              <p
                className="text-xs mt-1 mb-3"
                style={{ color: "var(--color-text-secondary)" }}
              >
                {c.name}
              </p>
              <div
                className="flex items-center gap-1 text-xs"
                style={{ color: themeColors[c.theme] || themeColors.default }}
              >
                Open Display <ArrowRight size={12} />
              </div>
            </Link>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
