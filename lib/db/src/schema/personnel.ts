import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const personnelTable = pgTable("personnel", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  role: text("role").notNull(),
  teamName: text("team_name").notNull(),
  contact: text("contact").notNull(),
  telegramId: text("telegram_id"),
  telegramChatId: text("telegram_chat_id"),
  fcmToken: text("fcm_token"),
  assignedMotorIds: integer("assigned_motor_ids").array().notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const insertPersonnelSchema = createInsertSchema(personnelTable).omit({
  id: true,
  createdAt: true,
});
export type InsertPersonnel = z.infer<typeof insertPersonnelSchema>;
export type Personnel = typeof personnelTable.$inferSelect;
