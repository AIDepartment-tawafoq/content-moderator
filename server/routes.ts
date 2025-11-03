// Enhanced Speech-to-Text WebSocket Server
// Combines your original blueprint with robust config from second version.

import type { Express } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { storage } from "./storage";
import { initSessionSchema, updateSessionSchema } from "@shared/schema";
import { SpeechClient } from "@google-cloud/speech";
import crypto from "crypto";
import fs from "fs";

// ========== Admin Session Management ==========
const adminSessions = new Map<string, { createdAt: number }>();
const SESSION_TIMEOUT = 24 * 60 * 60 * 1000; // 24h

function generateToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

function isValidAdminToken(token: string): boolean {
  const session = adminSessions.get(token);
  if (!session) return false;
  if (Date.now() - session.createdAt > SESSION_TIMEOUT) {
    adminSessions.delete(token);
    return false;
  }
  return true;
}

setInterval(
  () => {
    const now = Date.now();
    adminSessions.forEach((s, token) => {
      if (now - s.createdAt > SESSION_TIMEOUT) adminSessions.delete(token);
    });
  },
  60 * 60 * 1000,
);

// ========== Speech Client Initialization ==========

// Flexible credentials loader
let credentialsConfig: any = undefined;
if (process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON) {
  try {
    credentialsConfig = JSON.parse(
      process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON,
    );
  } catch (err) {
    console.error(
      "✗ Failed to parse GOOGLE_APPLICATION_CREDENTIALS_JSON:",
      err,
    );
  }
} else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  try {
    const p = process.env.GOOGLE_APPLICATION_CREDENTIALS;
    if (fs.existsSync(p))
      credentialsConfig = JSON.parse(fs.readFileSync(p, "utf8"));
  } catch (err) {
    console.error("✗ Failed to read credentials file:", err);
  }
}

// Environment-driven config
const PROJECT_ID =
  process.env.GOOGLE_CLOUD_PROJECT ||
  credentialsConfig?.project_id ||
  "not-configured";
const REGION = (process.env.STT_LOCATION || "global").toLowerCase();
const MODEL = process.env.STT_MODEL || "long";
const DEBUG = ["1", "true", "yes"].includes(
  (process.env.DEBUG || "0").toLowerCase(),
);
const LANGUAGES = (process.env.STT_LANGS || "ar-SA,ar-EG,en-US")
  .split(",")
  .map((x) => x.trim());
const PRIMARY_LANG = LANGUAGES[0] || "ar-SA";
const ALT_LANGS = LANGUAGES.slice(1, 3);

// Endpoint selection
let apiEndpoint = "speech.googleapis.com";
if (["us", "eu"].includes(REGION))
  apiEndpoint = `${REGION}-speech.googleapis.com`;

let speechClient: SpeechClient | undefined;
try {
  const opts: any = { apiEndpoint };
  if (credentialsConfig) opts.credentials = credentialsConfig;
  speechClient = new SpeechClient(opts);
  console.log(`✓ SpeechClient ready [${PROJECT_ID}] @ ${apiEndpoint}`);
} catch (err: any) {
  console.error("✗ Could not initialize SpeechClient:", err.message);
}

// ========== Main App ==========
export async function registerRoutes(app: Express): Promise<Server> {
  const httpServer = createServer(app);
  const wss = new WebSocketServer({ server: httpServer, path: "/ws" });

  // -------- Session APIs --------
  // إنشاء جلسة جديدة (بدون بيانات - فقط session ID)
  app.post("/api/sessions/init", async (req, res) => {
    try {
      // No form data needed - just create an empty session
      const s = await storage.createSession();
      res.json({ sessionId: s.id, status: "success" });
    } catch (err: any) {
      res
        .status(400)
        .json({ error: "فشل في إنشاء الجلسة", details: err.message });
    }
  });

  // تحديث بيانات الجلسة بعد الانتهاء (الاستبيان والتقييم)
  app.post("/api/sessions/:id/complete", async (req, res) => {
    try {
      const data = updateSessionSchema.parse(req.body);
      const s = await storage.updateSessionMetadata(req.params.id, data);
      if (!s) return res.status(404).json({ error: "الجلسة غير موجودة" });
      res.json({ success: true, session: s });
    } catch (err: any) {
      res
        .status(400)
        .json({ error: "فشل في تحديث الجلسة", details: err.message });
    }
  });

  app.get("/api/sessions/:id", async (req, res) => {
    try {
      const s = await storage.getSession(req.params.id);
      if (!s) return res.status(404).json({ error: "الجلسة غير موجودة" });
      res.json(s);
    } catch (err: any) {
      res
        .status(500)
        .json({ error: "خطأ في جلب بيانات الجلسة", details: err.message });
    }
  });

  // -------- Admin login --------
  app.post("/api/admin/login", async (req, res) => {
    try {
      const { username, password } = req.body;
      const validU = process.env.ADMIN_USERNAME || "moslehadmin";
      const validP = process.env.ADMIN_PASSWORD || "m@2025AtAOt";

      if (username === validU && password === validP) {
        const token = generateToken();
        adminSessions.set(token, { createdAt: Date.now() });
        res.json({ success: true, token });
      } else
        res
          .status(401)
          .json({ error: "اسم المستخدم أو كلمة المرور غير صحيحة" });
    } catch (err: any) {
      res
        .status(500)
        .json({ error: "خطأ في تسجيل الدخول", details: err.message });
    }
  });

  // -------- Admin Sessions List --------
  app.get("/api/admin/sessions", async (req, res) => {
    const auth = req.headers.authorization?.replace("Bearer ", "");
    if (!auth || !isValidAdminToken(auth))
      return res.status(401).json({ error: "غير مصرح" });
    try {
      const sessions = await storage.getAllSessions();
      res.json(sessions);
    } catch (err: any) {
      res
        .status(500)
        .json({ error: "خطأ في جلب الجلسات", details: err.message });
    }
  });

  // -------- Admin Sessions Export --------
  app.get("/api/admin/sessions/export", async (req, res) => {
    const auth = req.headers.authorization?.replace("Bearer ", "");
    if (!auth || !isValidAdminToken(auth))
      return res.status(401).json({ error: "غير مصرح" });
    try {
      const sessions = await storage.getAllSessions();
      const headers = [
        "ID",
        "تاريخ الجلسة",
        "عدد الأطراف",
        "نوع العلاقة",
        "يوجد أطفال متأثرون",
        "رقم الجلسة",
        "طبيعة المشكلة",
        "فعالية الجلسة",
        "تقدم المصالحة",
        "ملاحظات المستشار",
        "النص المحول",
        "الحالة",
        "تاريخ الاكتمال",
        "تاريخ الإنشاء",
      ];
      const rows = [headers.join(",")];
      sessions.forEach((s) =>
        rows.push(
          [
            s.id,
            s.sessionDate
              ? new Date(s.sessionDate).toLocaleString("ar-SA")
              : "",
            s.participantsCount || "",
            s.relationType || "",
            s.hasAffectedChildren ? "نعم" : "لا",
            s.sessionNumber || "",
            s.problemNature || "",
            s.sessionEffectiveness || "",
            s.reconciliationProgress || "",
            s.counselorNotes ? `"${s.counselorNotes.replace(/"/g, '""')}"` : "",
            s.transcribedText
              ? `"${s.transcribedText.replace(/"/g, '""')}"`
              : "",
            s.status,
            s.completedAt
              ? new Date(s.completedAt).toLocaleString("ar-SA")
              : "",
            new Date(s.createdAt).toLocaleString("ar-SA"),
          ].join(","),
        ),
      );
      const csv = "\uFEFF" + rows.join("\n");
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", "attachment; filename=sessions.csv");
      res.end(csv);
    } catch (err: any) {
      res
        .status(500)
        .json({ error: "خطأ في تصدير الجلسات", details: err.message });
    }
  });

  // ========== WebSocket Streaming STT ==========
  wss.on("connection", (ws: WebSocket, req) => {
    const url = new URL(req.url || "", `http://${req.headers.host}`);
    const sessionId = url.searchParams.get("sessionId");
    if (!sessionId) return ws.close(1008, "Missing sessionId");

    if (!speechClient) {
      ws.send(
        JSON.stringify({ type: "error", message: "STT service unavailable" }),
      );
      return ws.close();
    }

    const SILENCE_TIMEOUT = 300000; // 5min
    const STREAM_RESTART_INTERVAL = 270000; // 4.5min - restart before Google's 5min limit
    let accumulated = "";
    let recognizeStream: any = null;
    let silenceTimer: NodeJS.Timeout | null = null;
    let streamRestartTimer: NodeJS.Timeout | null = null;
    let isPaused = false;

    const resetSilenceTimer = () => {
      if (silenceTimer) clearTimeout(silenceTimer);
      silenceTimer = setTimeout(async () => {
        console.log(`Silence timeout for session ${sessionId}`);
        await storage.completeSession(sessionId).catch(() => {});
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(
            JSON.stringify({
              type: "session_complete",
              transcript: accumulated,
            }),
          );
          ws.close(1000, "Silence timeout");
        }
      }, SILENCE_TIMEOUT);
    };

    const restartRecognitionStream = () => {
      console.log(`Restarting recognition stream for session ${sessionId} to handle long duration`);
      if (recognizeStream && !recognizeStream.destroyed) {
        recognizeStream.end();
      }
      startRecognitionStream();
    };

    const startRecognitionStream = () => {
      const request = {
        config: {
          encoding: "LINEAR16" as const,
          sampleRateHertz: 16000,
          languageCode: PRIMARY_LANG,
          alternativeLanguageCodes: ALT_LANGS,
          enableAutomaticPunctuation: true,
          model: MODEL === "long" ? "latest_long" : "latest_short",
          useEnhanced: true,
          singleUtterance: false,
        },
        interimResults: true,
      };

      recognizeStream = speechClient!
        .streamingRecognize(request)
        .on("error", (err: any) => {
          console.error("Speech recognition error:", err.message);
          if (ws.readyState === WebSocket.OPEN)
            ws.send(
              JSON.stringify({
                type: "error",
                message: "خطأ في التحويل الصوتي",
              }),
            );
        })
        .on("data", async (data: any) => {
          const result = data.results?.[0];
          if (!result || !result.alternatives?.length) return;

          const transcript = result.alternatives[0].transcript;
          if (result.isFinal) {
            accumulated += (accumulated ? " " : "") + transcript;
            await storage
              .updateSessionTranscript(sessionId, accumulated)
              .catch(() => {});
            if (DEBUG) console.log(`Final: ${transcript}`);
            ws.send(
              JSON.stringify({
                type: "transcript",
                text: transcript,
                isFinal: true,
              }),
            );
            resetSilenceTimer();
          } else {
            ws.send(
              JSON.stringify({
                type: "transcript",
                text: transcript,
                isFinal: false,
              }),
            );
          }
        });

      // Set up automatic stream restart before hitting Google's limit
      if (streamRestartTimer) clearTimeout(streamRestartTimer);
      streamRestartTimer = setTimeout(() => {
        if (!isPaused && ws.readyState === WebSocket.OPEN) {
          restartRecognitionStream();
        }
      }, STREAM_RESTART_INTERVAL);
    };

    startRecognitionStream();
    resetSilenceTimer();

    ws.on("message", (msg: Buffer | string) => {
      if (!recognizeStream || recognizeStream.destroyed) return;
      try {
        const str = typeof msg === "string" ? msg : msg.toString("utf8");
        if (str.length < 1000) {
          try {
            const cmd = JSON.parse(str);
            if (cmd.type === "pause") {
              isPaused = true;
              if (streamRestartTimer) clearTimeout(streamRestartTimer);
              recognizeStream.end();
              recognizeStream = null;
              return;
            }
            if (cmd.type === "resume") {
              isPaused = false;
              startRecognitionStream();
              resetSilenceTimer();
              return;
            }
          } catch (_) {}
        }
        if (!isPaused) {
          const buffer = Buffer.isBuffer(msg) ? msg : Buffer.from(msg);
          recognizeStream.write(buffer);
          resetSilenceTimer();
        }
      } catch (err) {
        console.error("Error handling message:", err);
      }
    });

    ws.on("close", async () => {
      if (silenceTimer) clearTimeout(silenceTimer);
      if (streamRestartTimer) clearTimeout(streamRestartTimer);
      if (recognizeStream && !recognizeStream.destroyed) recognizeStream.end();
      if (accumulated)
        await storage
          .updateSessionTranscript(sessionId, accumulated)
          .catch(() => {});
      await storage.completeSession(sessionId).catch(() => {});
    });

    ws.on("error", (err) => console.error("WebSocket error:", err));
  });

  return httpServer;
}
