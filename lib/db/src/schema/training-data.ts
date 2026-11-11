/**
 * training_samples — every telemetry packet stored as a labelled training sample.
 *
 * Purpose: build a high-quality dataset for training Isolation Forest,
 * Random Forest, and XGBoost models in a future phase.
 *
 * Write path: POST /api/telemetry/update  (fire-and-forget after response)
 * Read path:  GET  /api/training-data/export.csv  (full CSV download)
 *             GET  /api/training-data/stats        (collection summary)
 *
 * Design rules:
 *   - motorId is stored as a plain integer (NOT a FK) so rows survive motor deletion.
 *   - vibrationDb duplicates noiseDb because both come from the same single acoustic
 *     sensor. When a dedicated vibration sensor is added, update only vibrationDb.
 *   - Every rule-engine output is captured verbatim so the dataset reflects the
 *     current decision boundary — models will be trained to replicate or improve it.
 *   - source records which endpoint ingested the packet (for future live-ingest path).
 */

import {
  pgTable,
  serial,
  timestamp,
  integer,
  real,
  text,
  boolean,
} from "drizzle-orm/pg-core";

export const trainingSamplesTable = pgTable("training_samples", {
  // ── Identity ────────────────────────────────────────────────────────────────
  id: serial("id").primaryKey(),

  /** Server-side receipt timestamp (UTC). Use this for train/test splits. */
  capturedAt: timestamp("captured_at", { withTimezone: true })
    .notNull()
    .defaultNow(),

  /** Which endpoint ingested this packet. */
  source: text("source").notNull().default("telemetry_update"),

  // ── Motor metadata (denormalised — intentionally not FK) ─────────────────
  motorId: integer("motor_id").notNull(),
  motorName: text("motor_name").notNull(),
  motorType: text("motor_type").notNull(),
  motorLocation: text("motor_location").notNull(),

  // ── Raw sensor readings (input features) ─────────────────────────────────
  /** Supply current in Amps. */
  currentAmps: real("current_amps").notNull(),

  /** Supply frequency in Hz. */
  frequencyHz: real("frequency_hz").notNull(),

  /** Total Harmonic Distortion percentage. Primary MCSA feature. */
  thdPct: real("thd_pct").notNull(),

  /**
   * Acoustic noise level in dB.
   * Same sensor as vibrationDb — stored separately for schema clarity.
   * Replace with a dedicated noise mic reading when hardware is upgraded.
   */
  noiseDb: real("noise_db").notNull(),

  /**
   * Vibration / acoustic intensity in dB.
   * Currently mirrors noiseDb (single sensor). Replace with dedicated
   * accelerometer reading when available.
   */
  vibrationDb: real("vibration_db").notNull(),

  // ── Rule-engine computed values (labels / targets) ────────────────────────
  /** Anomaly score [0, 1] from computeAnomalyScore(). The AI Confidence Index. */
  anomalyScore: real("anomaly_score").notNull(),

  /** Health score [0, 100] from computeHealthScore(). The canonical health metric. */
  healthScore: integer("health_score").notNull(),

  /** Motor status derived by deriveStatus(): running | warning | stopped. */
  derivedStatus: text("derived_status").notNull(),

  /**
   * Fault class label from classifyFaultType().
   * Values: "Bearing Wear Detected" | "High Vibration Detected" |
   *         "Temperature Above Threshold" | "Anomaly Detected" | "Normal"
   */
  faultLabel: text("fault_label").notNull(),

  /**
   * Whether shouldTriggerEmergencyTrip() fired for this packet.
   * This is the primary binary classification target.
   */
  relayTripped: boolean("relay_tripped").notNull(),

  /**
   * Alert severity the rule engine assigned to this packet.
   * Values: "none" | "low" | "medium" | "high"
   */
  alertSeverity: text("alert_severity").notNull().default("none"),

  /** Reserved for Survival Model output. Always null until that model is integrated. */
  daysToFailure: integer("days_to_failure"),
});

export type TrainingSample = typeof trainingSamplesTable.$inferSelect;
export type InsertTrainingSample = typeof trainingSamplesTable.$inferInsert;
