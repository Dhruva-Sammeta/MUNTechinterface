import { create } from "zustand";
import type {
  SessionMode,
  Delegate,
  Committee,
  Session,
  CommitteeTheme,
  SpeakerQueueState,
} from "./database.types";

// ============================================
// Global App Store (Zustand)
// ============================================

interface AppState {
  // Current user context
  currentDelegate: Delegate | null;
  currentCommittee: Committee | null;
  currentSession: Session | null;

  // Session mode (drives entire UI theme)
  mode: SessionMode;
  theme: CommitteeTheme;

  // Ephemeral speaker queue (never persisted)
  speakerQueue: SpeakerQueueState;

  // Global announcement overlay
  announcement: string | null;

  // Actions
  setCurrentDelegate: (d: Delegate | null) => void;
  setCurrentCommittee: (c: Committee | null) => void;
  setCurrentSession: (s: Session | null) => void;
  setMode: (m: SessionMode) => void;
  setTheme: (t: CommitteeTheme) => void;
  setSpeakerQueue: (q: SpeakerQueueState) => void;
  setAnnouncement: (a: string | null) => void;
}

export const useAppStore = create<AppState>((set) => ({
  currentDelegate: null,
  currentCommittee: null,
  currentSession: null,
  mode: "normal",
  theme: "default",
  speakerQueue: {
    current: null,
    queue: [],
    speaking_started_at: null,
    speaking_time_s: 90,
  },
  announcement: null,

  setCurrentDelegate: (d) => set({ currentDelegate: d }),
  setCurrentCommittee: (c) =>
    set({ currentCommittee: c, theme: c?.theme || "default" }),
  setCurrentSession: (s) =>
    set({ currentSession: s, mode: (s?.mode as SessionMode) || "normal" }),
  setMode: (m) => set({ mode: m }),
  setTheme: (t) => set({ theme: t }),
  setSpeakerQueue: (q) => set({ speakerQueue: q }),
  setAnnouncement: (a) => set({ announcement: a }),
}));
