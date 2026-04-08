// ============================================
// Sapphire MUN — Database Type Definitions
// Matches: 001_initial_schema.sql v2
// ============================================

export type SessionMode = "normal" | "crisis" | "voting" | "break";
export type DelegateRole = "delegate" | "eb" | "presentation" | "admin";
export type VotePosition = "for" | "against" | "abstain";
export type VotingRoundStatus = "open" | "closed";
export type DocumentType =
  | "working_paper"
  | "draft_resolution"
  | "amendment"
  | "press_release";
export type DocumentStatus = "pending" | "approved" | "rejected";
export type CommitteeType =
  | "general"
  | "crisis"
  | "press"
  | "special"
  | "creative"
  | "parliamentary";
export type CommitteeTheme = "default" | "pirate" | "flame";

// ---- Row types (1:1 with DB tables) ----

export interface Committee {
  id: string;
  name: string;
  short_name: string;
  type: CommitteeType;
  level: string;
  theme: CommitteeTheme;
  join_code: string;
  created_at: string;
}

export interface Delegate {
  id: string;
  user_id: string;
  committee_id: string;
  country: string;
  display_name: string;
  role: DelegateRole;
  is_present: boolean;
  joined_at: string;
}

export interface Session {
  id: string;
  committee_id: string;
  date: string;
  mode: SessionMode;
  agenda_text: string;
  timer_duration_s: number;
  timer_started_at: string | null;
  timer_paused: boolean;
  created_at: string;
}

export interface Attendance {
  id: string;
  delegate_id: string;
  session_id: string;
  marked_at: string;
  marked_by: string;
}

export interface VotingRound {
  id: string;
  session_id: string;
  resolution_title: string;
  status: VotingRoundStatus;
  opened_at: string;
  closed_at: string | null;
  created_by: string;
}

export interface Vote {
  id: string;
  voting_round_id: string;
  session_id: string;
  delegate_id: string;
  position: VotePosition;
  voted_at: string;
}

export interface Chit {
  id: string;
  session_id: string;
  from_delegate_id: string;
  to_delegate_id: string;
  content: string;
  is_approved: boolean | null;
  sent_at: string;
  approved_at: string | null;
  approved_by: string | null;
}

export interface Document {
  id: string;
  session_id: string;
  committee_id: string;
  title: string;
  type: DocumentType;
  content: string | null;
  file_path: string | null;
  file_name: string | null;
  uploaded_by: string;
  uploaded_at: string;
  status: DocumentStatus;
  reviewed_by: string | null;
}

export interface Bloc {
  id: string;
  session_id: string;
  name: string;
  color: string;
  created_by: string;
  created_at: string;
}

export interface BlocMember {
  id: string;
  bloc_id: string;
  delegate_id: string;
  joined_at: string;
}

export interface SpeakerListConfig {
  id: string;
  session_id: string;
  speaking_time_s: number;
  yield_enabled: boolean;
  created_by: string;
}

export type MessageScope = "public" | "private" | "bloc" | "eb";

export interface GlobalAnnouncement {
  id: string;
  content: string;
  created_by: string;
  created_at: string;
  expires_at: string | null;
}

export interface CommitteeMessage {
  id: string;
  committee_id: string;
  session_id: string;
  sender_id: string;
  recipient_id: string | null;
  bloc_id: string | null;
  scope: MessageScope;
  content: string;
  is_approved: boolean;
  created_at: string;
}

// ---- Join types (used in frontend queries) ----

export interface ChitWithDelegates extends Chit {
  from_delegate: Pick<Delegate, "id" | "display_name" | "country">;
  to_delegate: Pick<Delegate, "id" | "display_name" | "country">;
}

export interface DocumentWithUploader extends Document {
  uploader: Pick<Delegate, "id" | "display_name" | "country">;
}

export interface BlocMemberWithDelegate extends BlocMember {
  delegate: Pick<Delegate, "id" | "display_name" | "country">;
}

export interface BlocWithMembers extends Bloc {
  members: BlocMemberWithDelegate[];
}

export interface VotingRoundWithVotes extends VotingRound {
  votes: Vote[];
  tally: { for: number; against: number; abstain: number };
}

// ---- Ephemeral types (NEVER in DB) ----

export type SpeakerRequestType = "floor" | "order" | "privilege" | "inquiry";

export interface SpeakerQueueEntry {
  delegate_id: string;
  country: string;
  display_name: string;
  added_at: number;
  type?: SpeakerRequestType;
}

export interface SpeakerQueueState {
  current: SpeakerQueueEntry | null;
  queue: SpeakerQueueEntry[];
  speaking_started_at: number | null;
  speaking_time_s: number;
}

export interface RealtimeSessionEvent {
  type: "MODE_CHANGE" | "TIMER_UPDATE" | "AGENDA_UPDATE" | "ANNOUNCEMENT";
  payload: Record<string, unknown>;
  sent_by: string;
  sent_at: number;
}
