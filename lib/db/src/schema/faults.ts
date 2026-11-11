import {
  pgTable,
  text,
  serial,
  timestamp,
  integer,
  real,
  boolean,
  pgEnum,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { motorsTable } from "./motors";

export const faultSeverityEnum = pgEnum("fault_severity", [
  "critical",
  "high",
  "medium",
  "low",
]);

export const faultsTable = pgTable("faults", {
  id: serial("id").primaryKey(),
  motorId: integer("motor_id")
    .notNull()
    .references(() => motorsTable.id, { onDelete: "cascade" }),
  motorName: text("motor_name").notNull(),
  faultType: text("fault_type").notNull(),
  severity: faultSeverityEnum("severity").notNull().default("medium"),
  description: text("description").notNull(),
  possibleCauses: text("possible_causes").array().notNull().default([]),
  riskIfIgnored: text("risk_if_ignored").array().notNull().default([]),
  recommendedActions: text("recommended_actions").array().notNull().default([]),
  /** @deprecated Compatibility field retained for historical consumers. */
  anomalyScore: real("anomaly_score").notNull().default(0),
  /** Actual Isolation Forest anomaly score; null for rule-only historical rows. */
  ifAnomalyScore: real("if_anomaly_score"),
  /** Fault logs are created only for non-Normal Decision Engine results. */
  anomalyDetected: boolean("anomaly_detected").notNull().default(true),
  healthScore: integer("health_score").notNull().default(100),
  thdAtFault: real("thd_at_fault").notNull().default(0),
  dbAtFault: real("db_at_fault").notNull().default(0),
  resolved: boolean("resolved").notNull().default(false),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  detectedAt: timestamp("detected_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const insertFaultSchema = createInsertSchema(faultsTable).omit({
  id: true,
  detectedAt: true,
});
export type InsertFault = z.infer<typeof insertFaultSchema>;
export type Fault = typeof faultsTable.$inferSelect;
