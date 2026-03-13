import type { DatabaseSync } from "node:sqlite";
import { getMirrorMemoryDb } from "./db.js";
import type {
  AddCanonUpdateInput,
  AddObservationInput,
  AddRetrievalHistoryInput,
  CanonUpdateRecord,
  ObservationRecord,
  RetrievalHistoryRecord,
  UpsertUserReflectionInput,
  UserReflectionRecord,
} from "./types.js";

function useDb(db?: DatabaseSync): DatabaseSync {
  return db ?? getMirrorMemoryDb();
}

export function addObservation(input: AddObservationInput, db?: DatabaseSync): ObservationRecord {
  const database = useDb(db);
  const result = database
    .prepare(
      `INSERT INTO observations (
        source_type,
        source_ref,
        topic,
        content,
        confidence,
        is_canon_candidate
      ) VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(
      input.source_type,
      input.source_ref ?? null,
      input.topic,
      input.content,
      input.confidence ?? null,
      input.is_canon_candidate ? 1 : 0,
    );

  return database
    .prepare("SELECT * FROM observations WHERE id = ?")
    .get(result.lastInsertRowid) as ObservationRecord;
}

export function listObservationsByTopic(topic: string, db?: DatabaseSync): ObservationRecord[] {
  return useDb(db)
    .prepare("SELECT * FROM observations WHERE topic = ? ORDER BY created_at DESC, id DESC")
    .all(topic) as ObservationRecord[];
}

export function listRecentObservations(limit = 20, db?: DatabaseSync): ObservationRecord[] {
  return useDb(db)
    .prepare("SELECT * FROM observations ORDER BY created_at DESC, id DESC LIMIT ?")
    .all(limit) as ObservationRecord[];
}

export function addCanonUpdate(input: AddCanonUpdateInput, db?: DatabaseSync): CanonUpdateRecord {
  const database = useDb(db);
  const result = database
    .prepare(
      `INSERT INTO canon_updates (topic, status, summary, reference_scroll)
       VALUES (?, ?, ?, ?)`,
    )
    .run(input.topic, input.status, input.summary, input.reference_scroll);

  return database
    .prepare("SELECT * FROM canon_updates WHERE id = ?")
    .get(result.lastInsertRowid) as CanonUpdateRecord;
}

export function getCanonUpdateByTopic(topic: string, db?: DatabaseSync): CanonUpdateRecord | null {
  return (
    (useDb(db)
      .prepare(
        "SELECT * FROM canon_updates WHERE topic = ? ORDER BY created_at DESC, id DESC LIMIT 1",
      )
      .get(topic) as CanonUpdateRecord | undefined) ?? null
  );
}

export function upsertUserReflection(
  input: UpsertUserReflectionInput,
  db?: DatabaseSync,
): UserReflectionRecord {
  const database = useDb(db);

  database
    .prepare(
      `INSERT INTO user_reflections (
        user_id,
        preferred_language,
        tone_preference,
        recurring_topics,
        journey_stage,
        notes
      ) VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET
        created_at = CURRENT_TIMESTAMP,
        preferred_language = excluded.preferred_language,
        tone_preference = excluded.tone_preference,
        recurring_topics = excluded.recurring_topics,
        journey_stage = excluded.journey_stage,
        notes = excluded.notes`,
    )
    .run(
      input.user_id,
      input.preferred_language ?? null,
      input.tone_preference ?? null,
      input.recurring_topics ?? null,
      input.journey_stage ?? null,
      input.notes ?? null,
    );

  return database
    .prepare("SELECT * FROM user_reflections WHERE user_id = ?")
    .get(input.user_id) as UserReflectionRecord;
}

export function getUserReflection(userId: string, db?: DatabaseSync): UserReflectionRecord | null {
  return (
    (useDb(db).prepare("SELECT * FROM user_reflections WHERE user_id = ?").get(userId) as
      | UserReflectionRecord
      | undefined) ?? null
  );
}

export function listRecentRetrievalHistory(
  userId?: string,
  limit = 10,
  db?: DatabaseSync,
): RetrievalHistoryRecord[] {
  const database = useDb(db);
  if (userId) {
    return database
      .prepare(
        "SELECT * FROM retrieval_history WHERE user_id = ? ORDER BY created_at DESC, id DESC LIMIT ?",
      )
      .all(userId, limit) as RetrievalHistoryRecord[];
  }

  return database
    .prepare("SELECT * FROM retrieval_history ORDER BY created_at DESC, id DESC LIMIT ?")
    .all(limit) as RetrievalHistoryRecord[];
}

export function addRetrievalHistory(
  input: AddRetrievalHistoryInput,
  db?: DatabaseSync,
): RetrievalHistoryRecord {
  const database = useDb(db);
  const result = database
    .prepare(
      `INSERT INTO retrieval_history (
        user_id,
        question,
        answer_summary,
        referenced_scrolls,
        referenced_observation_ids,
        confidence
      ) VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(
      input.user_id ?? null,
      input.question,
      input.answer_summary,
      JSON.stringify(input.referenced_scrolls),
      JSON.stringify(input.referenced_observation_ids),
      input.confidence ?? null,
    );

  return database
    .prepare("SELECT * FROM retrieval_history WHERE id = ?")
    .get(result.lastInsertRowid) as RetrievalHistoryRecord;
}
