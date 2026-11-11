import {
  pgTable,
  text,
  serial,
  timestamp,
  integer,
  real,
  pgEnum,
  boolean,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const motorStatusEnum = pgEnum("motor_status", [
  "running",
  "warning",
  "stopped",
]);

export const motorsTable = pgTable("motors", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  location: text("location").notNull(),
  motorType: text("motor_type").notNull(),
  status: motorStatusEnum("status").notNull().default("running"),
  healthScore: integer("health_score").notNull().default(100),
  currentThd: real("current_thd").notNull().default(0),
  currentDb: real("current_db").notNull().default(0),
  /** @deprecated Use decisionIfAnomalyScore for the actual Isolation Forest score. */
  anomalyScore: real("anomaly_score").notNull().default(0),
  decisionAnomalyDetected: boolean("decision_anomaly_detected").notNull().default(false),
  daysToFailure: integer("days_to_failure"),
  decisionFaultLabel: text("decision_fault_label"),
  decisionFaultConfidence: real("decision_fault_confidence"),
  decisionMlActive: boolean("decision_ml_active"),
  decisionEmergencyTrip: boolean("decision_emergency_trip"),
  decisionOverrideFired: boolean("decision_override_fired"),
  decisionOverrideReason: text("decision_override_reason"),
  decisionIfAnomalyScore: real("decision_if_anomaly_score"),
  decisionRfTopClass: text("decision_rf_top_class"),
  decisionXgbTopClass: text("decision_xgb_top_class"),
  decisionModelsAgreed: boolean("decision_models_agreed"),
  decisionOriginalMlClass: text("decision_original_ml_class"),
  decisionOriginalMlConf: real("decision_original_ml_conf"),
  decisionUpdatedAt: timestamp("decision_updated_at", { withTimezone: true }),
  installedAt: text("installed_at").notNull().default("2024-01-01"),
  lastServiceAt: text("last_service_at"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const insertMotorSchema = createInsertSchema(motorsTable).omit({
  id: true,
  createdAt: true,
});
export type InsertMotor = z.infer<typeof insertMotorSchema>;
export type Motor = typeof motorsTable.$inferSelect;
