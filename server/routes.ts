// Enhanced Speech-to-Text WebSocket Server
// Fixed version with proper stream lifecycle management

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

  // ========== WebSocket Streaming STT (Production, >1hr) ==========
  wss.on("connection", (ws: WebSocket, req) => {
    const url = new URL(req.url || "", `http://${req.headers.host}`);
    const sessionId = url.searchParams.get("sessionId");
    if (!sessionId) return ws.close(1008, "Missing sessionId");

    if (!speechClient) {
      ws.send(JSON.stringify({ type: "error", message: "STT unavailable" }));
      return ws.close();
    }

    console.log(`[session ${sessionId}] WebSocket connected`);

    // ---- Tunables (safe defaults) ----
    // Based on Google's sample code: STREAMING_LIMIT = 240000 (4 minutes)
    // We restart at exactly 4 minutes to match Google's recommended approach
    const SAMPLE_RATE = 16000; // 16kHz PCM mono
    const BYTES_PER_SAMPLE = 2; // 16-bit
    // CRITICAL: Match Google sample's 4-minute limit exactly
    // Google's limit is 5 minutes, but sample code uses 4 minutes (240000ms)
    const STREAMING_LIMIT = 240000; // 4 minutes exactly (matches Google sample)
    const SEGMENT_MS = STREAMING_LIMIT; // Use same value for consistency
    const RESTART_BUFFER_MS = 0; // No buffer needed - restart at exactly 4 minutes
    const BRIDGE_SEC = 3; // bridge tail audio into next segment (matches Google sample approach)
    const MAX_BRIDGE = BRIDGE_SEC * SAMPLE_RATE * BYTES_PER_SAMPLE;
    const FLUSH_EVERY_MS = 30_000; // periodic flush
    const SILENCE_TIMEOUT_MS = 5 * 60 * 1000; // end session if no final words this long
    const HEALTH_NO_DATA_MS = 45_000; // watchdog restart if no data seen this long
    const MAX_BACKOFF_MS = 10_000; // cap for exponential backoff
    // No overlap - we end old stream completely before creating new one (matches Google sample)

    // ---- State ----
    let accumulated = "";
    let currentStream: any | null = null;
    let lastDataAt = Date.now();
    let lastFinalResultAt = Date.now(); // Track when we last got a FINAL result
    let streamStartedAt = Date.now(); // Track when the current stream was created
    let restarting = false; // Prevent concurrent restarts
    let isPaused = false; // User-triggered pause state
    let isClosing = false; // Shutdown flag to prevent restarts during cleanup
    let restartCounter = 0; // Track number of restarts (useful for debugging)

    // Rolling bridge buffer stores the last few seconds of audio
    // This audio is replayed into each new stream to ensure continuity
    // Based on Google's sample: we bridge the last few seconds to maintain context
    let bridgeBuffer: Buffer[] = [];
    let bridgeBytes = 0;

    // Track result end times for better bridging (inspired by Google sample)
    let lastResultEndTime = 0; // Last result end time in milliseconds
    let lastFinalResultEndTime = 0; // Last final result end time

    // Timers for various lifecycle management tasks
    let tSegment: NodeJS.Timeout | null = null;
    let tFlush: NodeJS.Timeout | null = null;
    let tSilence: NodeJS.Timeout | null = null;
    let tHealth: NodeJS.Timeout | null = null;

    // Exponential backoff for error recovery
    let backoffMs = 500;

    // Track active stream handlers to properly clean them up
    // Store handlers per stream to avoid conflicts
    const streamHandlers = new WeakMap<
      any,
      {
        onData: (data: any) => void;
        onError: (err: any) => void;
      }
    >();

    // ---- Utilities ----

    // Clear all active timers to prevent memory leaks and unexpected behavior
    const clearTimers = () => {
      if (tSegment) {
        clearTimeout(tSegment);
        tSegment = null;
      }
      if (tFlush) {
        clearInterval(tFlush);
        tFlush = null;
      }
      if (tSilence) {
        clearTimeout(tSilence);
        tSilence = null;
      }
      if (tHealth) {
        clearInterval(tHealth);
        tHealth = null;
      }
    };

    // Schedule automatic session completion after extended silence
    // This only resets when we receive final transcript results, not on interim results
    const scheduleSilenceTimer = () => {
      if (tSilence) clearTimeout(tSilence);
      const timeoutAt = new Date(
        Date.now() + SILENCE_TIMEOUT_MS,
      ).toLocaleTimeString();
      console.log(
        `[session ${sessionId}] Silence timer scheduled, will timeout at ${timeoutAt}`,
      );

      tSilence = setTimeout(async () => {
        const silenceDuration = Date.now() - lastFinalResultAt;
        console.log(
          `[session ${sessionId}] Silence timeout reached (${(silenceDuration / 1000).toFixed(0)}s since last final result)`,
        );
        await flushTranscript();
        await storage.completeSession(sessionId).catch(() => {});
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(
            JSON.stringify({
              type: "session_complete",
              transcript: accumulated,
              reason: "silence_timeout",
            }),
          );
          ws.close(1000, "Silence timeout");
        }
      }, SILENCE_TIMEOUT_MS);
    };

    // Persist the accumulated transcript to storage
    const flushTranscript = async () => {
      if (!accumulated) return;
      try {
        await storage.updateSessionTranscript(sessionId, accumulated);
        if (DEBUG)
          console.log(
            `[session ${sessionId}] Flushed ${accumulated.length} chars`,
          );
      } catch (e) {
        console.error(`[session ${sessionId}] Flush failed:`, e);
      }
    };

    // Start periodic background flushing to ensure data isn't lost
    const startPeriodicFlush = () => {
      if (tFlush) clearInterval(tFlush);
      tFlush = setInterval(flushTranscript, FLUSH_EVERY_MS);
    };

    // Health watchdog detects when the stream stops receiving data
    // This catches edge cases where Google silently stops sending data
    const startHealthWatchdog = () => {
      if (tHealth) clearInterval(tHealth);
      tHealth = setInterval(
        () => {
          if (isPaused || isClosing) return;
          const idle = Date.now() - lastDataAt;
          if (idle > HEALTH_NO_DATA_MS) {
            console.warn(
              `[session ${sessionId}] Health watchdog: No data for ${(idle / 1000).toFixed(0)}s — forcing restart`,
            );
            safeSegmentRestart("watchdog");
          }
        },
        Math.min(HEALTH_NO_DATA_MS / 3, 15000),
      ); // Check more frequently
    };

    // Add audio chunk to the rolling bridge buffer
    // This buffer maintains the last few seconds of audio for stream continuity
    const writeToBridge = (buf: Buffer) => {
      bridgeBuffer.push(buf);
      bridgeBytes += buf.length;
      // Keep only the most recent BRIDGE_SEC seconds of audio
      while (bridgeBytes > MAX_BRIDGE) {
        const dropped = bridgeBuffer.shift();
        bridgeBytes -= dropped?.length || 0;
      }
    };

    // Set up the segment restart timer with proper tracking
    // This is critical: we restart BEFORE hitting Google's 5-minute limit
    const setSegmentTimer = () => {
      if (tSegment) clearTimeout(tSegment);
      streamStartedAt = Date.now(); // Mark when this stream's lifecycle begins

      // Calculate safe restart time: base segment length minus safety buffer
      // Match Google sample: restart at exactly 4 minutes (240000ms)
      const safeSegmentMs = SEGMENT_MS - RESTART_BUFFER_MS;

      console.log(
        `[session ${sessionId}] Segment timer set: restart in ${(safeSegmentMs / 1000).toFixed(0)}s (at ${(safeSegmentMs / 60000).toFixed(1)} min) - matching Google sample's STREAMING_LIMIT`,
      );

      tSegment = setTimeout(() => {
        const actualAge = Date.now() - streamStartedAt;
        console.log(
          `[session ${sessionId}] ⏰ TIMER: Scheduled restart triggered at ${(actualAge / 1000).toFixed(1)}s (target was ${(safeSegmentMs / 1000).toFixed(0)}s)`,
        );
        // Double-check we're not already restarting
        if (!restarting && !isPaused && !isClosing) {
          safeSegmentRestart("scheduled");
        } else {
          console.warn(
            `[session ${sessionId}] Timer fired but restart blocked: restarting=${restarting}, paused=${isPaused}, closing=${isClosing}`,
          );
        }
      }, safeSegmentMs);

      // Add a verification log after a short delay to confirm timer is set
      setTimeout(() => {
        if (tSegment && !restarting) {
          const remaining = safeSegmentMs - (Date.now() - streamStartedAt);
          console.log(
            `[session ${sessionId}] Timer verified: ${(remaining / 1000).toFixed(0)}s until restart`,
          );
        }
      }, 5000);
    };

    // Backoff management for error recovery
    const increaseBackoff = () => {
      backoffMs = Math.min(MAX_BACKOFF_MS, Math.ceil(backoffMs * 1.8));
    };
    const resetBackoff = () => {
      backoffMs = 500;
    };

    // CRITICAL FIX: Properly remove event handlers from old stream
    const removeStreamHandlers = (stream: any) => {
      if (!stream) return;
      try {
        const handlers = streamHandlers.get(stream);
        if (handlers) {
          stream.removeListener("data", handlers.onData);
          stream.removeListener("error", handlers.onError);
          streamHandlers.delete(stream);
        }
      } catch (e) {
        console.warn(`[session ${sessionId}] Error removing handlers:`, e);
      }
    };

    // ---- Stream wiring ----

    // Handle incoming transcription results from Google
    // CRITICAL: Check that this data is from the current active stream
    const onData = async (data: any, sourceStream?: any) => {
      // Ignore data from old streams that haven't been cleaned up yet
      if (sourceStream && sourceStream !== currentStream) {
        if (DEBUG)
          console.log(`[session ${sessionId}] Ignoring data from old stream`);
        return;
      }

      lastDataAt = Date.now();
      const result = data?.results?.[0];
      if (!result || !result.alternatives?.length) return;
      const transcript = (result.alternatives[0].transcript || "").trim();
      if (!transcript) return;

      // Track result end time (inspired by Google sample code)
      // This helps with bridging and maintaining continuity across restarts
      if (result.resultEndTime) {
        const resultSeconds = result.resultEndTime.seconds || 0;
        // Google API uses nanos (nanoseconds), convert to milliseconds
        const resultNanos = result.resultEndTime.nanos || 0;
        const resultMillis = resultNanos / 1_000_000;
        lastResultEndTime = resultSeconds * 1000 + resultMillis;

        if (result.isFinal) {
          lastFinalResultEndTime = lastResultEndTime;
        }
      }

      if (result.isFinal) {
        // Final results are added to our accumulated transcript
        accumulated += (accumulated ? " " : "") + transcript;
        lastFinalResultAt = Date.now(); // Track when we got the final result
        await flushTranscript(); // Persist each final chunk immediately
        scheduleSilenceTimer(); // Reset silence timer on final words

        if (DEBUG) console.log(`[session ${sessionId}] Final: "${transcript}"`);
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(
            JSON.stringify({
              type: "transcript",
              text: transcript,
              isFinal: true,
            }),
          );
        }
      } else {
        // Interim results are sent but not accumulated
        if (DEBUG)
          console.log(`[session ${sessionId}] Interim: "${transcript}"`);
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(
            JSON.stringify({
              type: "transcript",
              text: transcript,
              isFinal: false,
            }),
          );
        }
      }
    };

    // Handle errors from Google's streaming API
    // CRITICAL: Check that this error is from the current active stream
    const onError = (err: any, sourceStream?: any) => {
      // Ignore errors from old streams that are being cleaned up
      if (sourceStream && sourceStream !== currentStream) {
        if (DEBUG)
          console.log(`[session ${sessionId}] Ignoring error from old stream`);
        return;
      }

      const msg = err?.message || String(err);
      const code = err?.code;
      console.warn(
        `[session ${sessionId}] Stream error code=${code} msg=${msg}`,
      );

      // Don't restart if we're already closing or paused
      if (isClosing || isPaused) return;

      // Common termination markers from Google that indicate we need to restart
      if (
        code === 11 || // RESOURCE_EXHAUSTED / RST
        msg.includes("RST_STREAM") ||
        msg.includes("INTERNAL") ||
        msg.includes("No status received") ||
        msg.includes("GOAWAY") ||
        msg.includes("DEADLINE_EXCEEDED")
      ) {
        increaseBackoff();
        setTimeout(() => safeSegmentRestart("error"), backoffMs);
        return;
      }

      // Unknown errors: still try a restart with backoff
      increaseBackoff();
      setTimeout(() => safeSegmentRestart("error"), backoffMs);
    };

    // Create a new Google streaming recognition stream
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

      // CRITICAL FIX: Create stream-specific handlers that check if this is the current stream
      const streamOnData = (data: any) => onData(data, stream);
      const streamOnError = (err: any) => onError(err, stream);

      // Store handlers per stream for proper cleanup
      streamHandlers.set(stream, {
        onData: streamOnData,
        onError: streamOnError,
      });

      stream.on("error", streamOnError);
      stream.on("data", streamOnData);

      console.log(
        `[session ${sessionId}] New stream created (stream #${restartCounter + 1})`,
      );

      return stream;
    };

    // Segment restart - create new stream, switch, then clean up old stream
    // Keep old stream active until new one is ready to prevent audio loss
    const safeSegmentRestart = async (
      reason: "scheduled" | "watchdog" | "error" | "safety",
    ) => {
      // Block concurrent restarts to prevent race conditions
      if (restarting || isPaused || isClosing) {
        if (DEBUG)
          console.log(
            `[session ${sessionId}] Restart blocked: restarting=${restarting}, paused=${isPaused}, closing=${isClosing}`,
          );
        return;
      }

      restarting = true;
      const restartStartTime = Date.now();
      const streamAge = restartStartTime - streamStartedAt;

      try {
        console.log(
          `[session ${sessionId}] 🔄 RESTART #${restartCounter + 1}: reason=${reason}, stream_age=${(streamAge / 1000).toFixed(1)}s`,
        );

        // Ensure any pending transcript is saved
        await flushTranscript();

        // Keep reference to old stream (don't clear currentStream yet - keep it active)
        const oldStream = currentStream;

        // Increment restart counter
        restartCounter++;

        // Create the new stream FIRST (while old stream still handles audio)
        console.log(`[session ${sessionId}] Creating new stream...`);
        const newStream = createStream();

        // Write bridge buffer to new stream BEFORE switching
        let bridgeWritten = 0;
        for (const chunk of bridgeBuffer) {
          try {
            newStream.write(chunk);
            bridgeWritten += chunk.length;
          } catch (e) {
            console.warn(`[session ${sessionId}] Bridge write failed:`, e);
          }
        }
        if (bridgeWritten > 0) {
          console.log(
            `[session ${sessionId}] Bridge: ${(bridgeWritten / (SAMPLE_RATE * BYTES_PER_SAMPLE)).toFixed(2)}s written`,
          );
        }

        // NOW switch to new stream (this is the critical moment)
        currentStream = newStream;
        console.log(
          `[session ${sessionId}] ✅ Stream switched to new stream #${restartCounter}`,
        );

        // Reset the segment timer IMMEDIATELY
        setSegmentTimer();

        // Reschedule the silence timer
        scheduleSilenceTimer();

        // Update lastDataAt
        lastDataAt = Date.now();

        // Clean up old stream AFTER new stream is active (non-blocking)
        if (oldStream && oldStream !== currentStream) {
          // Remove handlers to prevent old stream from interfering
          removeStreamHandlers(oldStream);

          // End and destroy old stream asynchronously
          setTimeout(() => {
            try {
              if (oldStream && !oldStream.destroyed) {
                oldStream.end();
                setTimeout(() => {
                  try {
                    if (!oldStream.destroyed) {
                      oldStream.destroy();
                      if (DEBUG)
                        console.log(
                          `[session ${sessionId}] Old stream cleaned up`,
                        );
                    }
                  } catch (e) {
                    // Ignore cleanup errors
                  }
                }, 100);
              }
            } catch (e) {
              // Ignore cleanup errors
            }
          }, 500); // Small delay to ensure new stream is processing
        }

        resetBackoff();
        console.log(
          `[session ${sessionId}] ✅ RESTART COMPLETE in ${Date.now() - restartStartTime}ms`,
        );
      } catch (error) {
        console.error(`[session ${sessionId}] ❌ Restart failed:`, error);
        increaseBackoff();
        // Try to recover
        try {
          if (!currentStream || currentStream.destroyed) {
            currentStream = createStream();
            setSegmentTimer();
            console.log(`[session ${sessionId}] Recovery stream created`);
          }
        } catch (e) {
          console.error(`[session ${sessionId}] Recovery failed:`, e);
        }
      } finally {
        restarting = false;
      }
    };

    // ---- Lifecycle ----

    // Initialize the first stream and all monitoring systems
    const start = () => {
      currentStream = createStream();
      streamStartedAt = Date.now();
      lastFinalResultAt = Date.now();
      startPeriodicFlush();
      setSegmentTimer();
      scheduleSilenceTimer();
      startHealthWatchdog();

      console.log(`[session ${sessionId}] Started - transcription active`);
    };

    start();

    // Handle incoming WebSocket messages (both audio data and control commands)
    ws.on("message", (msg: Buffer | string) => {
      if (isPaused || isClosing) return;

      // Safety check: Force restart if stream is close to 5-minute limit
      // This acts as a last-ditch safety net in case the timer fails
      const streamAge = Date.now() - streamStartedAt;
      if (streamAge > SEGMENT_MS - 10000 && !restarting) {
        console.warn(
          `[session ${sessionId}] ⚠️ SAFETY RESTART at ${(streamAge / 1000).toFixed(1)}s`,
        );
        safeSegmentRestart("safety");
        // Continue processing this message - it will go to old stream, then new stream takes over
      }

      // Critical: If stream age exceeds limit significantly, force immediate restart
      if (streamAge > SEGMENT_MS + 10000 && !restarting) {
        console.error(
          `[session ${sessionId}] 🚨 CRITICAL: Stream age ${(streamAge / 1000).toFixed(1)}s exceeds limit!`,
        );
        safeSegmentRestart("safety");
      }

      // Control messages are JSON (typically small)
      // Audio data is binary (typically larger buffers)
      try {
        if (
          typeof msg === "string" ||
          (Buffer.isBuffer(msg) && msg.length < 1024)
        ) {
          const str = typeof msg === "string" ? msg : msg.toString("utf8");
          try {
            const cmd = JSON.parse(str);

            // Handle pause command
            if (cmd?.type === "pause") {
              console.log(`[session ${sessionId}] Paused by user`);
              isPaused = true;
              clearTimers();
              try {
                if (currentStream) {
                  removeStreamHandlers(currentStream);
                  if (!currentStream.destroyed) {
                    currentStream.destroy();
                  }
                }
              } catch {}
              return;
            }

            // Handle resume command
            if (cmd?.type === "resume") {
              console.log(`[session ${sessionId}] Resumed by user`);
              isPaused = false;
              resetBackoff();
              if (currentStream) {
                removeStreamHandlers(currentStream);
                currentStream.destroy();
              }
              currentStream = createStream();
              streamStartedAt = Date.now();
              lastDataAt = Date.now();
              startPeriodicFlush();
              setSegmentTimer();
              scheduleSilenceTimer(); // Restart silence timer on resume
              startHealthWatchdog();
              return;
            }

            // Handle manual restart command
            if (cmd?.type === "restart_segment") {
              console.log(`[session ${sessionId}] Manual restart requested`);
              safeSegmentRestart("scheduled");
              return;
            }
          } catch {
            /* not a control JSON, treat as audio data */
          }
        }
      } catch {
        /* ignore parsing errors */
      }

      // Audio data path: write to current stream and update bridge buffer
      const buf = Buffer.isBuffer(msg) ? msg : Buffer.from(msg as string);

      // Always update bridge buffer (for continuity)
      writeToBridge(buf);

      // During restart, audio goes to old stream until new stream is ready
      // The restart function handles the switch
      if (!currentStream) {
        console.warn(`[session ${sessionId}] No current stream!`);
        return;
      }

      if (currentStream.destroyed) {
        console.warn(
          `[session ${sessionId}] Current stream destroyed, triggering restart`,
        );
        if (!restarting) {
          safeSegmentRestart("error");
        }
        return;
      }

      try {
        // Write to current stream (will be old stream during restart transition, then new stream)
        const written = currentStream.write(buf);
        if (!written && DEBUG) {
          console.log(`[session ${sessionId}] Stream buffer full`);
        }
      } catch (e) {
        // Write failed - try to restart
        console.warn(`[session ${sessionId}] Write failed:`, e);
        if (!restarting) {
          safeSegmentRestart("error");
        }
      }

      // Note: We do NOT reset the silence timer here
      // The silence timer only resets on final transcript results
    });

    // Handle WebSocket closure
    ws.on("close", async () => {
      console.log(`[session ${sessionId}] WebSocket closed, cleaning up`);
      isClosing = true; // Prevent any restart attempts during shutdown
      clearTimers();
      try {
        if (currentStream) {
          removeStreamHandlers(currentStream);
          if (!currentStream.destroyed) {
            currentStream.destroy();
            console.log(`[session ${sessionId}] Stream destroyed`);
          }
        }
      } catch (e) {
        console.warn(`[session ${sessionId}] Stream cleanup failed:`, e);
      }
      await flushTranscript();
      await storage.completeSession(sessionId).catch(() => {});
      console.log(`[session ${sessionId}] Session completed`);
    });

    // Handle WebSocket errors
    ws.on("error", (err) => {
      console.error(`[session ${sessionId}] WebSocket error:`, err);
    });
  });

  return httpServer;
}
