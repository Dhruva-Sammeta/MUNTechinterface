"use client";

import { SessionMode, CommitteeTheme } from "@/lib/database.types";
import { useTimer } from "@/hooks/useTimer";
import type { Session } from "@/lib/database.types";
import { motion, AnimatePresence } from "framer-motion";
import type { LucideIcon } from "lucide-react";

// ============================================
// Mode Badge
// ============================================
export function ModeBadge({
  mode,
  size = "sm",
}: {
  mode: SessionMode;
  size?: "sm" | "lg";
}) {
  const labels: Record<SessionMode, string> = {
    normal: "Normal Session",
    crisis: "Crisis",
    voting: "Voting",
    break: "Break",
  };

  const dotColors: Record<SessionMode, string> = {
    normal: "var(--color-mode-normal)",
    crisis: "var(--color-mode-crisis)",
    voting: "var(--color-mode-voting)",
    break: "var(--color-mode-break)",
  };

  const base = size === "lg" ? "text-sm px-5 py-2" : "text-xs px-3 py-1";

  return (
    <span className={`mode-badge mode-badge--${mode} ${base}`}>
      <span
        className="animate-pulse-dot w-2 h-2 rounded-full inline-block flex-shrink-0"
        style={{ background: dotColors[mode] }}
      />
      {labels[mode]}
    </span>
  );
}

// ============================================
// Timer Display
// ============================================
export function TimerDisplay({
  session,
  size = "md",
}: {
  session: Session | null;
  size?: "sm" | "md" | "lg";
}) {
  const { formatted, progress, isRunning } = useTimer(session);

  const sizes = {
    sm: "text-2xl",
    md: "text-5xl",
    lg: "text-8xl",
  };

  const ringSize = size === "lg" ? 200 : size === "md" ? 120 : 60;
  const strokeWidth = size === "lg" ? 6 : size === "md" ? 4 : 3;
  const radius = (ringSize - strokeWidth * 2) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - progress);

  const modeColor =
    session?.mode === "crisis"
      ? "var(--color-mode-crisis)"
      : session?.mode === "voting"
        ? "var(--color-mode-voting)"
        : session?.mode === "break"
          ? "var(--color-mode-break)"
          : "var(--color-mode-normal)";

  return (
    <div className="relative inline-flex items-center justify-center">
      <svg width={ringSize} height={ringSize} className="transform -rotate-90">
        <circle
          cx={ringSize / 2}
          cy={ringSize / 2}
          r={radius}
          fill="none"
          stroke="var(--color-border-default)"
          strokeWidth={strokeWidth}
          opacity={0.5}
        />
        <circle
          cx={ringSize / 2}
          cy={ringSize / 2}
          r={radius}
          fill="none"
          stroke={modeColor}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className="timer-ring"
          style={{
            filter: isRunning ? `drop-shadow(0 0 6px ${modeColor})` : "none",
          }}
        />
      </svg>
      <span
        className={`absolute timer-display font-bold ${sizes[size]} ${isRunning ? "" : "opacity-60"}`}
        style={{
          fontFamily: "var(--font-heading)",
          color: isRunning ? modeColor : "var(--color-text-secondary)",
          transition: "color 0.3s ease",
        }}
      >
        {formatted}
      </span>
    </div>
  );
}

// ============================================
// Glass Panel
// ============================================
export function GlassPanel({
  children,
  className = "",
  theme,
  padding = true,
  variant = "default",
}: {
  children: React.ReactNode;
  className?: string;
  theme?: CommitteeTheme;
  padding?: boolean;
  variant?: "default" | "elevated" | "active";
}) {
  const variantClass =
    variant === "elevated"
      ? "glass-card-elevated"
      : variant === "active"
        ? "glass-card glass-card--active"
        : "glass-card";

  return (
    <div
      className={`${variantClass} ${padding ? "p-5" : ""} ${className}`}
      data-theme={theme}
    >
      {children}
    </div>
  );
}

// ============================================
// Section Header
// ============================================
export function SectionHeader({
  title,
  subtitle,
  action,
  icon: Icon,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  icon?: LucideIcon;
}) {
  return (
    <div className="flex items-center justify-between mb-4">
      <div className="flex items-center gap-2.5">
        {Icon && (
          <Icon
            size={18}
            style={{ color: "var(--color-text-accent)", opacity: 0.7 }}
          />
        )}
        <div>
          <h2
            className="text-lg font-bold"
            style={{ fontFamily: "var(--font-heading)" }}
          >
            {title}
          </h2>
          {subtitle && (
            <p
              className="text-xs mt-0.5"
              style={{ color: "var(--color-text-muted)" }}
            >
              {subtitle}
            </p>
          )}
        </div>
      </div>
      {action}
    </div>
  );
}

// ============================================
// Empty State
// ============================================
export function EmptyState({
  icon: Icon,
  message,
}: {
  icon: React.ComponentType<{ size: number; style?: React.CSSProperties }>;
  message: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center animate-fade-in">
      <div className="animate-gentle-float">
        <Icon
          size={32}
          style={{ color: "var(--color-text-muted)", opacity: 0.5 }}
        />
      </div>
      <p className="mt-3 text-sm" style={{ color: "var(--color-text-muted)" }}>
        {message}
      </p>
    </div>
  );
}

export function ErrorBanner({
  message,
  onClose,
}: {
  message: string;
  onClose?: () => void;
}) {
  return (
    <div className="rounded-2xl border border-red-500/25 bg-red-500/10 p-4 text-sm text-red-100 shadow-sm mb-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-semibold text-red-100">Sync Error</p>
          <p className="mt-1 text-xs text-red-100/80">{message}</p>
        </div>
        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            className="text-red-100/70 hover:text-white"
          >
            Close
          </button>
        ) : null}
      </div>
    </div>
  );
}

// ============================================
// Tab System
// ============================================
export function Tabs({
  tabs,
  activeTab,
  onChange,
  accentColor,
}: {
  tabs: { id: string; label: string; icon?: React.ReactNode }[];
  activeTab: string;
  onChange: (id: string) => void;
  accentColor?: string;
}) {
  const accent = accentColor || "var(--color-sapphire-500)";

  return (
    <div
      className="flex gap-1 overflow-x-auto pb-1 px-4 md:px-6"
      style={{ borderBottom: "1px solid var(--color-border-default)" }}
    >
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onChange(tab.id)}
          className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium whitespace-nowrap transition-all relative"
          style={{
            color:
              activeTab === tab.id ? accent : "var(--color-text-secondary)",
          }}
        >
          {tab.icon}
          <span className="hidden sm:inline">{tab.label}</span>
          {activeTab === tab.id && (
            <motion.span
              layoutId="tab-indicator"
              className="absolute bottom-0 left-2 right-2 h-0.5 rounded-full"
              style={{ background: accent }}
              transition={{ type: "spring", stiffness: 400, damping: 30 }}
            />
          )}
        </button>
      ))}
    </div>
  );
}

// ============================================
// Announcement Overlay
// ============================================
export function AnnouncementOverlay({
  content,
  onDismiss,
}: {
  content: string;
  onDismiss: () => void;
}) {
  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md"
        onClick={onDismiss}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      >
        <motion.div
          className="text-center px-8"
          onClick={(e) => e.stopPropagation()}
          initial={{ opacity: 0, scale: 0.85, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.9 }}
          transition={{ type: "spring", stiffness: 300, damping: 25 }}
        >
          <p
            className="text-sm uppercase tracking-[0.3em] mb-4"
            style={{ color: "var(--color-sapphire-400)" }}
          >
            📢 Global Announcement
          </p>
          <h1
            className="text-3xl md:text-5xl font-bold max-w-3xl"
            style={{ fontFamily: "var(--font-heading)" }}
          >
            {content}
          </h1>
          <button className="btn-secondary mt-8" onClick={onDismiss}>
            Dismiss
          </button>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

// ============================================
// Mobile Bottom Navigation
// ============================================
export function MobileBottomNav({
  tabs,
  activeTab,
  onChange,
  accentColor,
}: {
  tabs: { id: string; label: string; icon: React.ReactNode; badge?: number }[];
  activeTab: string;
  onChange: (id: string) => void;
  accentColor?: string;
}) {
  const accent = accentColor || "var(--color-sapphire-500)";

  return (
    <div className="mobile-bottom-nav">
      <div className="nav-items">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => onChange(tab.id)}
            className={`nav-item ${activeTab === tab.id ? "active" : ""}`}
            style={{
              color: activeTab === tab.id ? accent : "var(--color-text-muted)",
            }}
          >
            {tab.icon}
            <span className="truncate max-w-[56px]">{tab.label}</span>
            {tab.badge && tab.badge > 0 ? (
              <span className="badge" style={{ background: accent }}>
                {tab.badge}
              </span>
            ) : null}
          </button>
        ))}
      </div>
    </div>
  );
}
