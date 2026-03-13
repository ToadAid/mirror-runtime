import type { DatabaseSync } from "node:sqlite";

export type MirrorMemoryDb = DatabaseSync;

export type ObservationSourceType = "tweet" | "telegram" | "manual" | "system";

export type ObservationRecord = {
  id: number;
  created_at: string;
  source_type: ObservationSourceType;
  source_ref: string | null;
  topic: string;
  content: string;
  confidence: number | null;
  is_canon_candidate: number;
};

export type AddObservationInput = {
  source_type: ObservationSourceType;
  source_ref?: string;
  topic: string;
  content: string;
  confidence?: number;
  is_canon_candidate?: boolean;
};

export type CanonUpdateRecord = {
  id: number;
  created_at: string;
  topic: string;
  status: string;
  summary: string;
  reference_scroll: string;
};

export type AddCanonUpdateInput = {
  topic: string;
  status: string;
  summary: string;
  reference_scroll: string;
};

export type UserReflectionRecord = {
  id: number;
  created_at: string;
  user_id: string;
  preferred_language: string | null;
  tone_preference: string | null;
  recurring_topics: string | null;
  journey_stage: string | null;
  notes: string | null;
};

export type UpsertUserReflectionInput = {
  user_id: string;
  preferred_language?: string;
  tone_preference?: string;
  recurring_topics?: string;
  journey_stage?: string;
  notes?: string;
};

export type RetrievalHistoryRecord = {
  id: number;
  created_at: string;
  user_id: string | null;
  question: string;
  answer_summary: string;
  referenced_scrolls: string;
  referenced_observation_ids: string;
  confidence: number | null;
};

export type AddRetrievalHistoryInput = {
  user_id?: string;
  question: string;
  answer_summary: string;
  referenced_scrolls: string[];
  referenced_observation_ids: number[];
  confidence?: number;
};
