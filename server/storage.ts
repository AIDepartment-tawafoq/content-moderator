// Based on javascript_database blueprint - adapted for sessions
import { sessions, type Session, type InsertSession } from "@shared/schema";
import { db } from "./db";
import { eq } from "drizzle-orm";

export interface IStorage {
  // Session operations
  createSession(session: InsertSession): Promise<Session>;
  getSession(id: string): Promise<Session | undefined>;
  getAllSessions(): Promise<Session[]>;
  updateSessionTranscript(id: string, transcript: string): Promise<void>;
  completeSession(id: string): Promise<void>;
}

export class DatabaseStorage implements IStorage {
  async createSession(insertSession: InsertSession): Promise<Session> {
    const [session] = await db
      .insert(sessions)
      .values({
        ...insertSession,
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
