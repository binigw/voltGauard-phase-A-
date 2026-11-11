import {
  pgTable,
  text,
  serial,
  timestamp,
  integer,
  boolean,
  pgEnum,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { motorsTable } from "./motors";

export const alertSeverityEnum = pgEnum("alert_severity", [
  "high",
  "medium",
  "low",
]);

export const alertsTable = pgTable("alerts", {
  id: serial("id").primaryKey(),
  motorId: integer("motor_id")
    .notNull()
    .references(() => motorsTable.id, { onDelete: "cascade" }),
  motorName: text("motor_name").notNull(),
  faultType: text("fault_type").notNull(),
  severity: alertSeverityEnum("severity").notNull().default("medium"),
  message: text("message").notNull(),
  acknowledged: boolean("acknowledged").notNull().default(false),
  acknowledgedAt: timestamp("acknowledged_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const insertAlertSchema = createInsertSchema(alertsTable).omit({
  id: true,
  createdAt: true,
});
export type InsertAlert = z.infer<typeof insertAlertSchema>;
export type Alert = typeof alertsTable.$inferSelect;
