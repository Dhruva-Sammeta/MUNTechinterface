"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";

export default function JoinPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  // Simple transition for the splash screen entry
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#040818] p-6 relative overflow-hidden">
      {/* Background ambient light */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/4 w-1/2 h-1/3 bg-blue-500/10 blur-[100px] rounded-full" />
        <div className="absolute bottom-0 right-1/4 w-1/2 h-1/3 bg-cyan-500/10 blur-[100px] rounded-full" />
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          className="w-full max-w-md bg-[#0a1024]/80 backdrop-blur-xl border border-white/10 rounded-2xl p-8 relative shadow-2xl"
        >
          {/* Subtle inner border glow */}
          <div className="absolute inset-x-2 top-0 h-px bg-gradient-to-r from-transparent via-cyan-500/30 to-transparent" />

          <div className="flex flex-col items-center mb-10 mt-4">
            <img
              src="/logo.png"
              alt="Sapphire MUN"
              className="w-24 h-24 object-contain mb-6 drop-shadow-[0_0_15px_rgba(15,200,255,0.4)]"
            />
            <h1
              className="text-3xl font-bold tracking-[0.2em] mb-2"
              style={{ fontFamily: "var(--font-heading)" }}
            >
              SAPPHIRE <span className="text-cyan-400">MUN</span>
            </h1>
            <p className="text-xs uppercase tracking-[0.3em] font-semibold text-blue-300/50">
              Delegate Platform
            </p>
          </div>

          <div className="space-y-4">
            <button
              onClick={() => {
                setLoading(true);
                // Simulate small delay for animation, then route
                setTimeout(() => router.push("/"), 400);
              }}
              disabled={loading}
              className="w-full py-4 rounded-xl flex items-center justify-center gap-3 font-bold uppercase tracking-widest transition-all bg-sapphire-500 hover:bg-sapphire-400 active:scale-[0.98] shadow-[0_0_20px_rgba(10,132,255,0.3)] disabled:opacity-50"
            >
              {loading ? (
                <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                "Enter Conference Portal"
              )}
            </button>
            <p className="text-center text-[10px] text-white/30 mt-6 !mb-2 uppercase tracking-widest break-words leading-relaxed w-64 mx-auto font-medium">
              Secure Event Connectivity
              <br /> End-to-End Encryption Enabled
            </p>
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
