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
// Enable debug mode by default to track transcription issues
const DEBUG = ["1", "true", "yes"].includes(
  (process.env.DEBUG || "1").toLowerCase(),
);
// Force Arabic-only transcription - no English alternatives
const LANGUAGES = (process.env.STT_LANGS || "ar-SA,ar-EG,ar-AE")
  .split(",")
  .map((x) => x.trim());
const PRIMARY_LANG = LANGUAGES[0] || "ar-SA";
const ALT_LANGS = LANGUAGES.slice(1, 3).filter((lang) =>
  lang.startsWith("ar-"),
);

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
// ========== WebSocket Streaming STT (Production, >1hr) ==========
wss.on("connection", (ws: WebSocket, req) => {
  const url = new URL(req.url || "", `http://${req.headers.host}`);
  const sessionId = url.searchParams.get("sessionId");
  if (!sessionId) return ws.close(1008, "Missing sessionId");
  if (!speechClient) {
    ws.send(JSON.stringify({ type: "error", message: "STT unavailable" }));
    return ws.close();
  }

  // ---- Tunables (safe defaults) ----
  const SAMPLE_RATE = 16000;             // 16kHz PCM mono
  const BYTES_PER_SAMPLE = 2;            // 16-bit
  const SEGMENT_MS = 4 * 60 * 1000;      // 4:00 restart (well before Google's ~5:00 cutoff)
  const BRIDGE_SEC = 3;                  // bridge tail audio into next segment
  const MAX_BRIDGE = BRIDGE_SEC * SAMPLE_RATE * BYTES_PER_SAMPLE;
  const FLUSH_EVERY_MS = 30_000;         // periodic flush
  const SILENCE_TIMEOUT_MS = 5 * 60 * 1000; // end session if no final words this long
  const HEALTH_NO_DATA_MS = 45_000;      // watchdog restart if no data seen this long
  const MAX_BACKOFF_MS = 10_000;         // cap for exponential backoff

  // ---- State ----
  let accumulated = "";
  let currentStream: any | null = null;
  let lastDataAt = Date.now();
  let restarting = false;
  let isPaused = false;

  // rolling bridge buffer (last few seconds of audio)
  let bridgeBuffer: Buffer[] = [];
  let bridgeBytes = 0;

  // timers
  let tSegment: NodeJS.Timeout | null = null;
  let tFlush: NodeJS.Timeout | null = null;
  let tSilence: NodeJS.Timeout | null = null;
  let tHealth: NodeJS.Timeout | null = null;

  // backoff
  let backoffMs = 500;

  // ---- Utilities ----
  const clearTimers = () => {
    if (tSegment) { clearTimeout(tSegment); tSegment = null; }
    if (tFlush) { clearInterval(tFlush); tFlush = null; }
    if (tSilence) { clearTimeout(tSilence); tSilence = null; }
    if (tHealth) { clearInterval(tHealth); tHealth = null; }
  };

  const scheduleSilenceTimer = () => {
    if (tSilence) clearTimeout(tSilence);
    tSilence = setTimeout(async () => {
      await flushTranscript();
      await storage.completeSession(sessionId).catch(() => {});
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "session_complete", transcript: accumulated }));
        ws.close(1000, "Silence timeout");
      }
    }, SILENCE_TIMEOUT_MS);
  };

  const flushTranscript = async () => {
    if (!accumulated) return;
    try {
      await storage.updateSessionTranscript(sessionId, accumulated);
      // console.log(`[flush] ${accumulated.length} chars`);
    } catch (e) {
      console.error("Flush failed:", e);
    }
  };

  const startPeriodicFlush = () => {
    if (tFlush) clearInterval(tFlush);
    tFlush = setInterval(flushTranscript, FLUSH_EVERY_MS);
  };

  const startHealthWatchdog = () => {
    if (tHealth) clearInterval(tHealth);
    tHealth = setInterval(() => {
      if (isPaused) return;
      const idle = Date.now() - lastDataAt;
      if (idle > HEALTH_NO_DATA_MS) {
        console.warn(`[health] No data for ${idle}ms — forcing segment restart`);
        safeSegmentRestart("watchdog");
      }
    }, Math.min(HEALTH_NO_DATA_MS, 15000));
  };

  const writeToBridge = (buf: Buffer) => {
    bridgeBuffer.push(buf);
    bridgeBytes += buf.length;
    while (bridgeBytes > MAX_BRIDGE) {
      const dropped = bridgeBuffer.shift();
      bridgeBytes -= dropped?.length || 0;
    }
  };

  const setSegmentTimer = () => {
    if (tSegment) clearTimeout(tSegment);
    tSegment = setTimeout(() => safeSegmentRestart("scheduled"), SEGMENT_MS);
  };

  const increaseBackoff = () => {
    backoffMs = Math.min(MAX_BACKOFF_MS, Math.ceil(backoffMs * 1.8));
  };
  const resetBackoff = () => { backoffMs = 500; };

  // ---- Stream wiring ----
  const onData = async (data: any) => {
    lastDataAt = Date.now();
    const result = data?.results?.[0];
    if (!result || !result.alternatives?.length) return;
    const transcript = (result.alternatives[0].transcript || "").trim();
    if (!transcript) return;

    if (result.isFinal) {
      accumulated += (accumulated ? " " : "") + transcript;
      await flushTranscript();                 // persist each final chunk
      scheduleSilenceTimer();                  // only reset on final words
      ws.send(JSON.stringify({ type: "transcript", text: transcript, isFinal: true }));
    } else {
      ws.send(JSON.stringify({ type: "transcript", text: transcript, isFinal: false }));
    }
  };

  const onError = (err: any) => {
    const msg = err?.message || String(err);
    const code = err?.code;
    console.warn(`[stream error] code=${code} msg=${msg}`);
    // Common termination markers from Google
    if (
      code === 11 ||                                 // RESOURCE_EXHAUSTED / RST
      msg.includes("RST_STREAM") ||
      msg.includes("INTERNAL") ||
      msg.includes("No status received") ||
      msg.includes("GOAWAY")
    ) {
      increaseBackoff();
      setTimeout(() => safeSegmentRestart("error"), backoffMs);
      return;
    }
    // Unknown errors: still try a restart
    increaseBackoff();
    setTimeout(() => safeSegmentRestart("error"), backoffMs);
  };

  const createStream = () => {
    const request = {
      config: {
        encoding: "LINEAR16" as const,
        sampleRateHertz: SAMPLE_RATE,
        languageCode: PRIMARY_LANG,
        alternativeLanguageCodes: ALT_LANGS,
        enableAutomaticPunctuation: true,
        model: "latest_long",
        useEnhanced: true,
        singleUtterance: false,
      },
      interimResults: true,
    };
    const stream = speechClient!.streamingRecognize(request);
    stream.on("error", onError);
    stream.on("data", onData);
    return stream;
  };

  // Rolling (overlapped) segment restart
  const safeSegmentRestart = async (reason: "scheduled" | "watchdog" | "error") => {
    if (restarting || isPaused) return;
    restarting = true;
    try {
      await flushTranscript(); // make sure DB is up-to-date

      const oldStream = currentStream;
      const newStream = createStream();
      currentStream = newStream;

      // Immediately re-feed the bridge tail into the new stream
      for (const chunk of bridgeBuffer) {
        try { newStream.write(chunk); } catch { /* ignore */ }
      }

      // small overlap window so the new stream is hot before closing old
      setTimeout(() => {
        try { oldStream && !oldStream.destroyed && oldStream.end(); } catch { /* ignore */ }
      }, 1500);

      // reschedule segment timer & health checks
      setSegmentTimer();
      resetBackoff();
    } finally {
      restarting = false;
    }
  };

  // ---- Lifecycle ----
  const start = () => {
    currentStream = createStream();
    startPeriodicFlush();
    setSegmentTimer();
    scheduleSilenceTimer();
    startHealthWatchdog();
  };

  start();

  ws.on("message", (msg: Buffer | string) => {
    if (!currentStream || currentStream.destroyed || isPaused) return;

    // control messages (JSON) are short; audio is binary or long buffers
    try {
      if (typeof msg === "string" || (Buffer.isBuffer(msg) && msg.length < 1024)) {
        const str = typeof msg === "string" ? msg : msg.toString("utf8");
        try {
          const cmd = JSON.parse(str);
          if (cmd?.type === "pause") {
            isPaused = true;
            clearTimers();
            try { currentStream && !currentStream.destroyed && currentStream.end(); } catch {}
            return;
          }
          if (cmd?.type === "resume") {
            isPaused = false;
            // start fresh segment
            resetBackoff();
            currentStream = createStream();
            startPeriodicFlush();
            setSegmentTimer();
            scheduleSilenceTimer();
            return;
          }
          if (cmd?.type === "restart_segment") {
            safeSegmentRestart("scheduled");
            return;
          }
        } catch { /* not a control JSON */ }
      }
    } catch { /* ignore */ }

    // audio data path
    const buf = Buffer.isBuffer(msg) ? msg : Buffer.from(msg as string);
    try { currentStream.write(buf); } catch { /* stream might be closing; ignore */ }
    writeToBridge(buf);
    // do NOT reset silence timer on raw audio — we only want to reset on final words
  });

  ws.on("close", async () => {
    clearTimers();
    try { currentStream && !currentStream.destroyed && currentStream.end(); } catch {}
    await flushTranscript();
    await storage.completeSession(sessionId).catch(() => {});
  });

  ws.on("error", (err) => {
    console.error("WebSocket error:", err);
  });
});

  
  return httpServer;
}
