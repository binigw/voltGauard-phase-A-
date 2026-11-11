import {
  pgTable,
  serial,
  timestamp,
  integer,
  real,
  boolean,
  text,
  jsonb,
} from "drizzle-orm/pg-core";
import { motorsTable } from "./motors";

export const telemetryTable = pgTable("telemetry", {
  id: serial("id").primaryKey(),
  motorId: integer("motor_id")
    .notNull()
    .references(() => motorsTable.id, { onDelete: "cascade" }),
  current: real("current").notNull(),
  thd: real("thd").notNull(),
  db: real("db").notNull(),
  frequency: real("frequency").notNull().default(50),
  /** @deprecated Compatibility field retained for historical consumers. */
  anomalyScore: real("anomaly_score").notNull().default(0),
  /** Actual Isolation Forest anomaly score; null when ML inference was unavailable. */
  ifAnomalyScore: real("if_anomaly_score"),
  /** True when the final Decision Engine result is non-Normal. */
  anomalyDetected: boolean("anomaly_detected").notNull().default(false),
  healthScore: integer("health_score").notNull().default(100),
  /** Final Decision Engine label persisted with this telemetry snapshot. */
  finalDecision: text("final_decision"),
  /** True when a sensor or relay rule replaced the raw ML result. */
  overrideFault: boolean("override_fault").notNull().default(false),
  /** Explicit simulation marker for non-hardware test packets. */
  isSimulation: boolean("is_simulation").notNull().default(false),
  /** Source label for telemetry provenance auditing. */
  telemetrySource: text("telemetry_source").notNull().default("UNKNOWN"),
  /** Stable backend trace identifier for this persisted telemetry snapshot. */
  traceId: text("trace_id").notNull().default("legacy"),
  /** Raw sampled current waveform, when a real waveform was supplied. */
  rawWaveform: jsonb("raw_waveform").$type<number[] | null>(),
  /** Optional three-phase RMS currents preserved for scalar trend analysis. */
  phaseCurrentsA: jsonb("phase_currents_a").$type<number[] | null>(),
  /** Optional three-phase voltage readings preserved for audit context. */
  phaseVoltagesV: jsonb("phase_voltages_v").$type<number[] | null>(),
  /** Paired MCSA harmonic frequencies supplied by an external spectral analyzer. */
  mcsaHarmonicFrequenciesHz: jsonb("mcsa_harmonic_frequencies_hz").$type<number[] | null>(),
  /** Paired MCSA harmonic magnitudes supplied by an external spectral analyzer. */
  mcsaHarmonicMagnitudes: jsonb("mcsa_harmonic_magnitudes").$type<number[] | null>(),
  /** Bearing fault frequency used to interpret the supplied MCSA sidebands. */
  mcsaBearingFaultFrequencyHz: real("mcsa_bearing_fault_frequency_hz"),
  /** True when dB was supplied by the sensor; the inference baseline is not displayed as measured data. */
  dbAvailable: boolean("db_available").notNull().default(true),
  /** Decision Engine output copied at ingestion for explanation replay. */
  faultConfidence: real("fault_confidence"),
  severity: text("severity"),
  status: text("status"),
  emergencyTrip: boolean("emergency_trip").notNull().default(false),
  overrideReason: text("override_reason").notNull().default(""),
  rfTopClass: text("rf_top_class"),
  xgbTopClass: text("xgb_top_class"),
  modelsAgreed: boolean("models_agreed"),
  timestamp: timestamp("timestamp", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type Telemetry = typeof telemetryTable.$inferSelect;
