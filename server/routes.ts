// Enhanced Speech-to-Text WebSocket Server
// Using Speechmatics Realtime API

import type { Express } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { storage } from "./storage";
import { initSessionSchema, updateSessionSchema } from "@shared/schema";
import { RealtimeClient } from "@speechmatics/real-time-client";
import { createSpeechmaticsJWT } from "@speechmatics/auth";
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

// ========== Speechmatics Realtime API Configuration ==========

const SPEECHMATICS_API_KEY = process.env.SPEECHMATICS_API_KEY || "";
const DEBUG = ["1", "true", "yes"].includes(
  (process.env.DEBUG || "1").toLowerCase(),
);

// Language configuration - Arabic
const LANGUAGE = process.env.STT_LANG || "ar";
const LANGUAGE_VARIANT = process.env.STT_LANG_VARIANT || "ar-SA";

if (!SPEECHMATICS_API_KEY) {
  console.error("✗ SPEECHMATICS_API_KEY environment variable is required");
}

console.log(`✓ Speechmatics Realtime API configured`);
console.log(`✓ Language: ${LANGUAGE} (${LANGUAGE_VARIANT})`);

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

    if (!SPEECHMATICS_API_KEY) {
      ws.send(
        JSON.stringify({
          type: "error",
          message: "Speechmatics API key not configured",
        }),
      );
      return ws.close();
    }

    console.log(`[session ${sessionId}] WebSocket connected`);

    // ---- Tunables (safe defaults) ----
    // Speechmatics doesn't have a 5-minute limit, but we restart periodically for reliability
    const SAMPLE_RATE = 16000; // 16kHz PCM mono
    const BYTES_PER_SAMPLE = 2; // 16-bit
    const STREAMING_LIMIT = 240000; // 4 minutes - restart periodically for reliability
    const SEGMENT_MS = STREAMING_LIMIT;
    const RESTART_BUFFER_MS = 0;
    const BRIDGE_SEC = 3; // bridge tail audio into next segment
    const MAX_BRIDGE = BRIDGE_SEC * SAMPLE_RATE * BYTES_PER_SAMPLE;
    const FLUSH_EVERY_MS = 30_000; // periodic flush
    const SILENCE_TIMEOUT_MS = 5 * 60 * 1000; // end session if no final words this long
    const HEALTH_NO_DATA_MS = 45_000; // watchdog restart if no data seen this long
    const MAX_BACKOFF_MS = 10_000; // cap for exponential backoff

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
          `[session ${sessionId}] ⏰ TIMER FIRED: Restart at ${(actualAge / 1000).toFixed(1)}s`,
        );
        if (!restarting && !isPaused && !isClosing) {
          safeSegmentRestart("scheduled");
        }
      }, safeSegmentMs);
    };

    // Backoff management for error recovery
    const increaseBackoff = () => {
      backoffMs = Math.min(MAX_BACKOFF_MS, Math.ceil(backoffMs * 1.8));
    };
    const resetBackoff = () => {
      backoffMs = 500;
    };

    // Remove event handlers from old stream
    const removeStreamHandlers = (stream: any) => {
      if (!stream) return;
      try {
        const handlers = streamHandlers.get(stream);
        if (handlers) {
          // RealtimeClient uses removeEventListener
          if (stream.removeEventListener) {
            stream.removeEventListener("receiveMessage", handlers.onData);
            stream.removeEventListener("error", handlers.onError);
          }
          streamHandlers.delete(stream);
        }
      } catch (e) {
        console.warn(`[session ${sessionId}] Error removing handlers:`, e);
      }
    };

    // ---- Stream wiring ----

    // Handle incoming transcription results from Speechmatics
    const onData = async (data: any, sourceStream?: any) => {
      // Ignore data from old streams
      if (sourceStream && sourceStream !== currentStream) {
        if (DEBUG)
          console.log(`[session ${sessionId}] Ignoring data from old stream`);
        return;
      }

      lastDataAt = Date.now();

      // Speechmatics message format from real-time-client
      // Format: data.results.map((r) => r.alternatives?.[0].content).join(' ')
      if (
        data.message === "AddTranscript" ||
        data.message === "AddPartialTranscript"
      ) {
        // Extract transcript - format matches the example code
        let transcript = "";

        if (data.results && Array.isArray(data.results)) {
          transcript = data.results
            .map((r: any) => r.alternatives?.[0]?.content)
            .filter((text: string) => text)
            .join(" ");
        }

        if (!transcript) return;

        const isFinal = data.message === "AddTranscript";

        if (isFinal) {
          // Final results are added to our accumulated transcript
          accumulated += (accumulated ? " " : "") + transcript;
          lastFinalResultAt = Date.now();
          await flushTranscript();
          scheduleSilenceTimer();

          if (DEBUG)
            console.log(`[session ${sessionId}] Final: "${transcript}"`);
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
          // Partial/interim results
          if (DEBUG)
            console.log(`[session ${sessionId}] Partial: "${transcript}"`);
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
      }
    };

    // Handle errors from Speechmatics
    const onError = (err: any, sourceStream?: any) => {
      // Ignore errors from old streams
      if (sourceStream && sourceStream !== currentStream) {
        if (DEBUG)
          console.log(`[session ${sessionId}] Ignoring error from old stream`);
        return;
      }

      const msg = err?.message || String(err);
      console.warn(`[session ${sessionId}] Speechmatics error: ${msg}`);

      if (isClosing || isPaused) return;

      // Restart on connection errors
      if (
        msg.includes("ECONNRESET") ||
        msg.includes("ETIMEDOUT") ||
        msg.includes("WebSocket") ||
        msg.includes("connection")
      ) {
        increaseBackoff();
        setTimeout(() => safeSegmentRestart("error"), backoffMs);
        return;
      }

      // Other errors: try restart with backoff
      increaseBackoff();
      setTimeout(() => safeSegmentRestart("error"), backoffMs);
    };

    // Create a new Speechmatics Realtime client
    const createStream = async () => {
      const client = new RealtimeClient();

      // Handle messages from Speechmatics
      const streamOnMessage = (event: any) => {
        onData(event.data, client);
      };

      const streamOnError = (err: any) => {
        onError(err, client);
      };

      // Store handlers
      streamHandlers.set(client, {
        onData: streamOnMessage,
        onError: streamOnError,
      });

      client.addEventListener("receiveMessage", streamOnMessage);
      client.addEventListener("error", streamOnError);

      // Create JWT for authentication
      try {
        const jwt = await createSpeechmaticsJWT({
          type: "rt",
          apiKey: SPEECHMATICS_API_KEY,
          ttl: 60, // 1 minute
        });

        // Start the recognition session
        await client.start(jwt, {
          transcription_config: {
            language: LANGUAGE,
            language_variant: LANGUAGE_VARIANT,
            output_locale: LANGUAGE_VARIANT,
            enable_partials: true,
            operating_point: "enhanced",
          },
        });

        console.log(`[session ${sessionId}] Speechmatics recognition started`);

        // Add sendAudio method
        (client as any).sendAudio = (audioData: Buffer) => {
          client.sendAudio(audioData);
        };

        // Add stop method
        (client as any).stop = () => {
          client.stopRecognition({ noTimeout: false });
        };

        // Add close method
        (client as any).close = () => {
          client.stopRecognition({ noTimeout: false });
        };

        console.log(
          `[session ${sessionId}] New Speechmatics stream created (stream #${restartCounter + 1})`,
        );

        return client;
      } catch (error: any) {
        console.error(
          `[session ${sessionId}] Failed to start Speechmatics:`,
          error,
        );
        throw error;
      }
    };

    // Simple restart: End old stream, create new stream, continue
    // Core pattern: Run ~4 min → End → Recreate → Continue
    const safeSegmentRestart = async (
      reason: "scheduled" | "watchdog" | "error" | "safety",
    ) => {
      if (restarting || isPaused || isClosing) return;

      restarting = true;
      const streamAge = Date.now() - streamStartedAt;

      console.log(
        `\n[session ${sessionId}] ===== RESTART #${restartCounter + 1} (${reason}) =====\n` +
          `Stream age: ${(streamAge / 1000).toFixed(1)}s\n`,
      );

      try {
        // 1. Save transcript
        await flushTranscript();

        // 2. End old stream completely
        const oldStream = currentStream;
        if (oldStream) {
          console.log(`[session ${sessionId}] Ending old stream...`);
          removeStreamHandlers(oldStream);
          try {
            // Send EndOfStream and close WebSocket
            if (oldStream.readyState === 1) {
              // WebSocket.OPEN = 1
              if ((oldStream as any).stop) {
                (oldStream as any).stop();
              }
            }
            if ((oldStream as any).close) {
              (oldStream as any).close();
            }
          } catch (e) {
            console.warn(
              `[session ${sessionId}] Error stopping old stream:`,
              e,
            );
          }
        }

        // 3. Clear reference and increment counter
        currentStream = null;
        restartCounter++;

        // 4. Create brand new stream
        console.log(`[session ${sessionId}] Creating new stream...`);
        const newStream = await createStream();

        // 5. Write bridge buffer for continuity
        for (const chunk of bridgeBuffer) {
          try {
            // Speechmatics uses sendAudio method
            if ((newStream as any).sendAudio) {
              (newStream as any).sendAudio(chunk);
            }
          } catch (e) {
            console.warn(`[session ${sessionId}] Bridge write failed:`, e);
          }
        }

        // 6. Activate new stream
        currentStream = newStream;
        streamStartedAt = Date.now();
        setSegmentTimer();
        scheduleSilenceTimer();
        lastDataAt = Date.now();

        console.log(
          `[session ${sessionId}] New stream #${restartCounter} active\n` +
            `========================================\n`,
        );

        resetBackoff();
      } catch (error) {
        console.error(`[session ${sessionId}] Restart error:`, error);
        // Emergency recovery
        try {
          currentStream = await createStream();
          streamStartedAt = Date.now();
          setSegmentTimer();
        } catch (e) {
          console.error(`[session ${sessionId}] Recovery failed:`, e);
        }
      } finally {
        restarting = false;
      }
    };

    // ---- Lifecycle ----

    // Initialize the first stream and all monitoring systems
    const start = async () => {
      try {
        currentStream = await createStream();
        streamStartedAt = Date.now();
        lastFinalResultAt = Date.now();
        startPeriodicFlush();
        setSegmentTimer();
        scheduleSilenceTimer();
        startHealthWatchdog();

        console.log(`[session ${sessionId}] Started - transcription active`);
      } catch (error) {
        console.error(`[session ${sessionId}] Failed to start:`, error);
        ws.send(
          JSON.stringify({
            type: "error",
            message: "Failed to start transcription",
          }),
        );
        ws.close();
      }
    };

    start();

    // Handle incoming WebSocket messages (both audio data and control commands)
    ws.on("message", (msg: Buffer | string) => {
      if (isPaused || isClosing) return;

      // Safety check: Force restart if timer failed
      const streamAge = Date.now() - streamStartedAt;
      if (streamAge > SEGMENT_MS - 5000 && !restarting) {
        console.warn(
          `[session ${sessionId}] ⚠️ SAFETY RESTART at ${(streamAge / 1000).toFixed(1)}s`,
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
                  if ((currentStream as any).stop)
                    (currentStream as any).stop();
                  if ((currentStream as any).close)
                    (currentStream as any).close();
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
                if ((currentStream as any).stop) (currentStream as any).stop();
                if ((currentStream as any).close)
                  (currentStream as any).close();
              }
              // Create stream asynchronously
              createStream()
                .then((stream) => {
                  currentStream = stream;
                  streamStartedAt = Date.now();
                  lastDataAt = Date.now();
                  startPeriodicFlush();
                  setSegmentTimer();
                  scheduleSilenceTimer();
                  startHealthWatchdog();
                })
                .catch((err) => {
                  console.error(
                    `[session ${sessionId}] Failed to resume:`,
                    err,
                  );
                });
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

      // Audio data: write to current stream
      const buf = Buffer.isBuffer(msg) ? msg : Buffer.from(msg as string);

      // Update bridge buffer (for continuity across restarts)
      writeToBridge(buf);

      // If no stream or restarting, buffer audio (will be written to new stream)
      if (!currentStream || restarting) {
        return;
      }

      try {
        // Speechmatics uses sendAudio method (sends binary data)
        if ((currentStream as any).sendAudio) {
          (currentStream as any).sendAudio(buf);
        } else if (currentStream.readyState === 1) {
          // WebSocket.OPEN = 1
          // Fallback: send binary directly
          currentStream.send(buf);
        } else {
          console.warn(
            `[session ${sessionId}] Stream not ready (state: ${currentStream.readyState})`,
          );
          if (!restarting) {
            safeSegmentRestart("error");
          }
        }
      } catch (e) {
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
          if ((currentStream as any).stop) (currentStream as any).stop();
          if ((currentStream as any).close) (currentStream as any).close();
          console.log(`[session ${sessionId}] Stream closed`);
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
