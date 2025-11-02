// Based on javascript_database blueprint - adapted for sessions
import { sessions, type Session, type UpdateSession } from "@shared/schema";
import { db } from "./db";
import { eq } from "drizzle-orm";

export interface IStorage {
  // Session operations
  createSession(): Promise<Session>;
  getSession(id: string): Promise<Session | undefined>;
  getAllSessions(): Promise<Session[]>;
  updateSessionTranscript(id: string, transcript: string): Promise<void>;
  updateSessionMetadata(id: string, metadata: UpdateSession): Promise<Session | undefined>;
  completeSession(id: string): Promise<void>;
}

export class DatabaseStorage implements IStorage {
  async createSession(): Promise<Session> {
    const [session] = await db
      .insert(sessions)
      .values({
        status: "pending",
      })
      .returning();
    return session;
  }

  async getSession(id: string): Promise<Session | undefined> {
    const [session] = await db.select().from(sessions).where(eq(sessions.id, id));
    return session || undefined;
  }

  async updateSessionTranscript(id: string, transcript: string): Promise<void> {
    await db
      .update(sessions)
      .set({ 
        transcribedText: transcript,
        status: "recording"
      })
      .where(eq(sessions.id, id));
  }

  async getAllSessions(): Promise<Session[]> {
    const allSessions = await db.select().from(sessions).orderBy(sessions.createdAt);
    return allSessions;
  }

  async updateSessionMetadata(id: string, metadata: UpdateSession): Promise<Session | undefined> {
    const [session] = await db
      .update(sessions)
      .set({
        sessionDate: new Date(metadata.sessionDate),
        participantsCount: metadata.participantsCount,
        relationType: metadata.relationType,
        hasAffectedChildren: metadata.hasAffectedChildren,
        sessionNumber: metadata.sessionNumber,
        problemNature: metadata.problemNature,
        sessionEffectiveness: metadata.sessionEffectiveness,
        reconciliationProgress: metadata.reconciliationProgress,
        counselorNotes: metadata.counselorNotes,
      })
      .where(eq(sessions.id, id))
      .returning();
    return session || undefined;
  }

  async completeSession(id: string): Promise<void> {
    await db
      .update(sessions)
      .set({ 
        status: "completed",
        completedAt: new Date()
      })
      .where(eq(sessions.id, id));
  }
}

export const storage = new DatabaseStorage();
