import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, integer, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// جدول جلسات التسجيل - يحفظ معلومات الجلسة والاستبيان
export const sessions = pgTable("sessions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  // معلومات الموافقة
  participantName: text("participant_name"), // اختياري
  consentedAt: timestamp("consented_at").notNull().defaultNow(),
  
  // بيانات الاستبيان
  sessionDate: timestamp("session_date"),
  participantsCount: integer("participants_count").notNull(),
  relationType: text("relation_type").notNull(), // زوجان، أقارب، والد وابنه، أخرى
  hasAffectedChildren: boolean("has_affected_children").notNull().default(false),
  
  // النص المحول - لا يتم حفظ أي تسجيل صوتي
  transcribedText: text("transcribed_text"),
  
  // معلومات الجلسة
  status: text("status").notNull().default("pending"), // pending, recording, completed
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Schema للإدخال
export const insertSessionSchema = createInsertSchema(sessions).omit({
  id: true,
  consentedAt: true,
  completedAt: true,
  createdAt: true,
  transcribedText: true,
  status: true,
}).extend({
  participantName: z.string().optional(),
  sessionDate: z.string().optional().transform(val => val ? new Date(val) : undefined),
  participantsCount: z.number().min(1).max(10),
  relationType: z.enum(["زوجان", "أقارب", "والد وابنه", "أخرى"]),
  hasAffectedChildren: z.boolean(),
});

export type InsertSession = z.infer<typeof insertSessionSchema>;
export type Session = typeof sessions.$inferSelect;
