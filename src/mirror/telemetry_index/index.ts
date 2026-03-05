export {
  DEFAULT_MIRROR_TELEMETRY_INDEX_DB_PATH,
  ensureTelemetryIndexSchema,
  openTelemetryIndexDb,
  resolveMirrorTelemetryIndexDbPath,
} from "./db.js";
export { indexTelemetryFile } from "./indexer.js";
export {
  countEventsByType,
  getEventsByType,
  getEventsSince,
  getLastEvent,
  getRecentEvents,
} from "./query.js";
export type { IndexedEventRow } from "./query.js";
export type { IndexTelemetryFileOptions } from "./indexer.js";
