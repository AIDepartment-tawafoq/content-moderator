import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, integer, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// جدول جلسات التسجيل - يحفظ معلومات الجلسة والاستبيان
export const sessions = pgTable("sessions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  
  // النص المحول - لا يتم حفظ أي تسجيل صوتي
  transcribedText: text("transcribed_text"),
  
  // بيانات الاستبيان (يتم ملؤها من قبل المستشار بعد الجلسة)
  sessionDate: timestamp("session_date"),
  participantsCount: integer("participants_count"),
  relationType: text("relation_type"), // زوجان، أقارب، والد وابنه، أخرى
  hasAffectedChildren: boolean("has_affected_children"),
  sessionNumber: text("session_number"), // الأولى، الثانية، الثالثة، أكثر من ثلاث
  problemNature: text("problem_nature"), // طبيعة المشكلة
  
  // تقييم المستشار للجلسة (يتم ملؤها بعد الجلسة)
  sessionEffectiveness: text("session_effectiveness"), // فعالة جداً، فعالة، متوسطة، غير فعالة
  reconciliationProgress: text("reconciliation_progress"), // تقدم ممتاز، تقدم جيد، تقدم ضعيف، لا يوجد تقدم
  counselorNotes: text("counselor_notes"), // ملاحظات المستشار
  
  // معلومات الجلسة
  status: text("status").notNull().default("pending"), // pending, recording, completed
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Schema للبدء بجلسة جديدة (بدون بيانات - فقط إنشاء session)
export const initSessionSchema = z.object({});

// Schema لتحديث بيانات الجلسة بعد الانتهاء (الاستبيان)
export const updateSessionSchema = z.object({
  sessionDate: z.string().min(1, "يرجى اختيار تاريخ الجلسة"),
  participantsCount: z.number().min(1, "يجب أن يكون العدد 1 على الأقل").max(10, "الحد الأقصى 10 أطراف"),
  relationType: z.enum(["زوجان", "أقارب", "والد وابنه", "أخرى"]),
  hasAffectedChildren: z.boolean(),
  sessionNumber: z.enum(["الأولى", "الثانية", "الثالثة", "أكثر من ثلاث"]),
  problemNature: z.enum(["خلافات زوجية", "خلافات أسرية", "خلافات مالية", "خلافات على الحضانة", "خلافات أخرى"]),
  sessionEffectiveness: z.enum(["فعالة جداً", "فعالة", "متوسطة", "غير فعالة"]),
  reconciliationProgress: z.enum(["تقدم ممتاز", "تقدم جيد", "تقدم ضعيف", "لا يوجد تقدم"]),
  counselorNotes: z.string().optional(),
});

export type InitSession = z.infer<typeof initSessionSchema>;
export type UpdateSession = z.infer<typeof updateSessionSchema>;
export type Session = typeof sessions.$inferSelect;
