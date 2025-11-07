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
  (process.env.DEBUG || "0").toLowerCase(),
);
const ENABLE_SCHEDULED_RESTARTS = ["1", "true", "yes"].includes(
  (process.env.ENABLE_SCHEDULED_RESTARTS || "0").toLowerCase(),
);

// Language configuration - Arabic
const LANGUAGE = process.env.STT_LANG || "ar";
const LANGUAGE_VARIANT = process.env.STT_LANG_VARIANT || "ar-SA";

if (!SPEECHMATICS_API_KEY) {
  console.error("✗ SPEECHMATICS_API_KEY environment variable is required");
}

console.log(`✓ Speechmatics Realtime API configured`);
console.log(`✓ Language: ${LANGUAGE} (${LANGUAGE_VARIANT})`);
console.log(
  ENABLE_SCHEDULED_RESTARTS
    ? "• Scheduled restarts ENABLED (legacy behaviour)"
    : "• Scheduled restarts DISABLED (using long-lived Speechmatics stream)",
);

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

    console.log(`\n[session ${sessionId}] ===== WEBSOCKET CONNECTED =====`);
    console.log(`[session ${sessionId}] Session ID: ${sessionId}`);
    console.log(
      `[session ${sessionId}] API Key configured: ${SPEECHMATICS_API_KEY ? "Yes (length: " + SPEECHMATICS_API_KEY.length + ")" : "No"}`,
    );
    console.log(
      `[session ${sessionId}] Language: ${LANGUAGE} (${LANGUAGE_VARIANT})`,
    );
    console.log(
      `[session ${sessionId}] ====================================\n`,
    );

    // ---- Tunables (safe defaults) ----
    // Speechmatics supports long sessions without needing periodic restarts
    const SAMPLE_RATE = 16000; // 16kHz PCM mono
    const BYTES_PER_SAMPLE = 2; // 16-bit
    const FLUSH_EVERY_MS = 30_000; // periodic flush
    const SILENCE_TIMEOUT_MS = 5 * 60 * 1000; // end session after 5 minutes of silence
    const MAX_BACKOFF_MS = 10_000; // cap for exponential backoff

    // ---- State ----
    let accumulated = "";
    let currentStream: any | null = null;
    let lastDataAt = Date.now();
    let lastFinalResultAt = Date.now(); // Track when we last got a FINAL result
    let isPaused = false; // User-triggered pause state
    let isClosing = false; // Shutdown flag to prevent restarts during cleanup

    // Timers for various lifecycle management tasks
    let tFlush: NodeJS.Timeout | null = null;
    let tSilence: NodeJS.Timeout | null = null;

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
      if (tFlush) {
        clearInterval(tFlush);
        tFlush = null;
      }
      if (tSilence) {
        clearTimeout(tSilence);
        tSilence = null;
      }
    };

    // Schedule automatic session completion after extended silence
    // Resets on ANY transcript activity (both partials and finals) to keep active sessions alive
    const scheduleSilenceTimer = () => {
      if (tSilence) clearTimeout(tSilence);
      const timeoutAt = new Date(
        Date.now() + SILENCE_TIMEOUT_MS,
      ).toLocaleTimeString();
      if (DEBUG) {
        console.log(
          `[session ${sessionId}] Silence timer scheduled, will timeout at ${timeoutAt}`,
        );
      }

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
      // Ignore data from old streams (but allow if currentStream not set yet during initialization)
      if (sourceStream && currentStream && sourceStream !== currentStream) {
        if (DEBUG)
          console.log(`[session ${sessionId}] Ignoring data from old stream`);
        return;
      }

      // If currentStream is not set, this is likely during initialization - log but don't process yet
      if (!currentStream) {
        if (DEBUG)
          console.log(
            `[session ${sessionId}] Received data before stream ready, ignoring`,
          );
        return;
      }

      lastDataAt = Date.now();

      // Speechmatics message format from real-time-client
      // Format: data.results.map((r) => r.alternatives?.[0].content).join(' ')

      // Handle Error messages
      if (data.message === "Error") {
        const errorType = data.type || "unknown";
        const errorReason = data.reason || "Unknown error";
        console.error(
          `[session ${sessionId}] Speechmatics error in onData: ${errorType} - ${errorReason}`,
        );

        // Don't restart on quota errors - just log them
        if (errorType === "quota_exceeded") {
          console.warn(
            `[session ${sessionId}] Quota exceeded - waiting before retry`,
          );
          return;
        }

        // For other errors, trigger error handler
        if (!isClosing) {
          onError(new Error(`${errorType}: ${errorReason}`), sourceStream);
        }
        return;
      }

      // Only process transcript messages - ignore Info, AudioAdded, etc.
      if (
        data.message !== "AddTranscript" &&
        data.message !== "AddPartialTranscript"
      ) {
        // Silently ignore non-transcript messages (Info, AudioAdded, etc.)
        return;
      }

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

        // Silently ignore empty transcripts (normal during silence)
        if (!transcript) {
          return;
        }

        // Only log when DEBUG is enabled
        if (DEBUG) {
          console.log(
            `[session ${sessionId}] Extracted transcript: "${transcript}" (${data.message})`,
          );
        }

        const isFinal = data.message === "AddTranscript";

        if (isFinal) {
          // Final results are added to our accumulated transcript
          accumulated += (accumulated ? " " : "") + transcript;
          lastFinalResultAt = Date.now();
          await flushTranscript();
          scheduleSilenceTimer();

          // Log final transcripts (important for debugging)
          console.log(`[session ${sessionId}] ✓ Final: "${transcript}"`);
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
          // Partial/interim results - reset silence timer to keep session alive
          scheduleSilenceTimer();
          
          // Only log if DEBUG enabled
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
      console.error(`[session ${sessionId}] Speechmatics error: ${msg}`);

      if (isClosing || isPaused) return;

      // Send error to client
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(
          JSON.stringify({
            type: "error",
            message: msg,
          }),
        );
      }
    };

    // Create a new Speechmatics Realtime client
    const createStream = async () => {
      console.log(`[session ${sessionId}] Creating RealtimeClient instance...`);
      const client = new RealtimeClient();
      console.log(`[session ${sessionId}] RealtimeClient instance created`);

      // Create JWT for authentication FIRST
      if (!SPEECHMATICS_API_KEY || SPEECHMATICS_API_KEY.trim() === "") {
        throw new Error("SPEECHMATICS_API_KEY is not set or is empty");
      }

      console.log(`[session ${sessionId}] Creating JWT token...`);
      const jwt = await createSpeechmaticsJWT({
        type: "rt",
        apiKey: SPEECHMATICS_API_KEY,
        ttl: 60, // 1 minute
      });

      if (!jwt || jwt.trim() === "") {
        throw new Error("JWT token creation returned empty string");
      }

      console.log(`[session ${sessionId}] JWT created successfully`);

      // Set up promise to wait for RecognitionStarted
      let recognitionStartedFlag = false;
      const audioBuffer: Buffer[] = []; // Buffer audio until RecognitionStarted

      // Save the original sendAudio method BEFORE we wrap it
      // This must be done before the promise setup so we can use it in onRecognitionStarted
      const originalSendAudio = client.sendAudio.bind(client);

      const recognitionPromise = new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(
            new Error("RecognitionStarted timeout - no response from server"),
          );
        }, 10000); // 10 second timeout

        const onRecognitionStarted = () => {
          clearTimeout(timeout);
          recognitionStartedFlag = true;
          console.log(
            `[session ${sessionId}] ✓ RecognitionStarted - ready to receive audio`,
          );

          // Flush buffered audio after a short delay to ensure socket is fully ready
          // Speechmatics needs a moment after RecognitionStarted before accepting audio
          setTimeout(() => {
            if (audioBuffer.length > 0) {
              if (DEBUG) {
                console.log(
                  `[session ${sessionId}] Flushing ${audioBuffer.length} buffered audio chunks`,
                );
              }
              for (const chunk of audioBuffer) {
                try {
                  // Use the original method directly, not the wrapped one
                  originalSendAudio(chunk);
                } catch (e) {
                  console.warn(
                    `[session ${sessionId}] Error flushing buffered audio:`,
                    e,
                  );
                }
              }
              audioBuffer.length = 0; // Clear buffer
            }
          }, 200); // 200ms delay to ensure socket is ready

          resolve();
        };

        // Speechmatics sends RecognitionStarted via receiveMessage, not a separate event
        // Set up a handler to listen for RecognitionStarted message
        const recognitionStartedMessageHandler = (event: any) => {
          const msg = event.data;

          // Only log if DEBUG enabled
          if (DEBUG) {
            console.log(
              `[session ${sessionId}] recognitionStartedMessageHandler received:`,
              {
                message: msg?.message,
              },
            );
          }

          if (msg?.message === "RecognitionStarted") {
            console.log(
              `[session ${sessionId}] RecognitionStarted message detected!`,
            );
            client.removeEventListener(
              "receiveMessage",
              recognitionStartedMessageHandler,
            );
            onRecognitionStarted();
          } else if (msg?.message === "Error") {
            clearTimeout(timeout);
            client.removeEventListener(
              "receiveMessage",
              recognitionStartedMessageHandler,
            );
            console.error(
              `[session ${sessionId}] Error message received:`,
              msg,
            );
            reject(new Error(msg?.type || msg?.reason || "Unknown error"));
          }
        };

        // Listen for RecognitionStarted message via receiveMessage
        client.addEventListener(
          "receiveMessage",
          recognitionStartedMessageHandler,
        );
      });

      // Handle messages from Speechmatics
      // Note: In the sample code, event listeners are set up BEFORE start()
      const streamOnMessage = (event: any) => {
        const msg = event.data;

        // Only process messages after recognition has started
        if (!recognitionStartedFlag) {
          // Silently ignore messages before recognition started
          return;
        }

        // Process the message
        onData(msg, client);
      };

      // Store handlers
      streamHandlers.set(client, {
        onData: streamOnMessage,
        onError: () => {}, // Errors come through receiveMessage, not a separate event
      });

      try {
        console.log(`[session ${sessionId}] Starting recognition with JWT...`);

        // Set up message handlers BEFORE start (matching sample code pattern)
        // The sample code sets up event listeners before calling start()
        client.addEventListener("receiveMessage", streamOnMessage);

        // Prepare configuration
        // For raw audio over WebSocket, audio_format is REQUIRED (per documentation)
        // The sample code uses files which auto-detect, but we're sending raw PCM
        const config = {
          audio_format: {
            type: "raw" as const,
            encoding: "pcm_s16le" as const,
            sample_rate: SAMPLE_RATE,
          },
          transcription_config: {
            language: LANGUAGE,
            enable_partials: true,
            operating_point: "enhanced" as const,
          },
        };

        if (DEBUG) {
          console.log(
            `[session ${sessionId}] Start config:`,
            JSON.stringify(config, null, 2),
          );
          console.log(
            `[session ${sessionId}] JWT length: ${jwt.length}, first 20 chars: ${jwt.substring(0, 20)}...`,
          );
        }

        // Start the recognition session
        // audio_format is required for raw PCM audio over WebSocket
        await client.start(jwt, config);

        // Wait for RecognitionStarted event BEFORE setting currentStream
        await recognitionPromise;

        // NOW set currentStream after RecognitionStarted is confirmed
        currentStream = client;

        // Wrap sendAudio method to buffer until RecognitionStarted
        // Use the originalSendAudio that was saved earlier (before wrapping)
        (client as any).sendAudio = (audioData: Buffer) => {
          if (recognitionStartedFlag) {
            // Call the original method directly to avoid recursion
            originalSendAudio(audioData);
          } else {
            // Buffer audio until RecognitionStarted
            audioBuffer.push(audioData);
            if (DEBUG && audioBuffer.length === 1) {
              console.log(
                `[session ${sessionId}] Buffering audio until RecognitionStarted...`,
              );
            }
          }
        };

        // Add stop method
        (client as any).stop = () => {
          client.stopRecognition();
        };

        // Add close method
        (client as any).close = () => {
          client.stopRecognition();
        };

        console.log(
          `[session ${sessionId}] New Speechmatics stream created`,
        );

        return client;
      } catch (error: any) {
        console.error(
          `[session ${sessionId}] Failed to start Speechmatics:`,
          error,
        );
        console.error(`[session ${sessionId}] Error details:`, {
          message: error?.message,
          stack: error?.stack,
          code: error?.code,
          name: error?.name,
          type: typeof error,
          keys: error ? Object.keys(error) : [],
          fullError: JSON.stringify(error, Object.getOwnPropertyNames(error)),
        });
        // Reset currentStream on error
        if (currentStream === client) {
          currentStream = null;
        }
        // Clean up client on error
        try {
          client.stopRecognition();
        } catch (e) {
          // Ignore cleanup errors
        }
        throw error;
      }
    };


    // ---- Lifecycle ----

    // Initialize the first stream and all monitoring systems
    const start = async () => {
      console.log(`[session ${sessionId}] ===== STARTING TRANSCRIPTION =====`);
      try {
        console.log(
          `[session ${sessionId}] Step 1: Creating Speechmatics stream...`,
        );
        currentStream = await createStream();
        console.log(
          `[session ${sessionId}] Step 2: Stream created successfully`,
        );

        lastFinalResultAt = Date.now();
        startPeriodicFlush();
        scheduleSilenceTimer();

        console.log(`[session ${sessionId}] ===== TRANSCRIPTION ACTIVE =====`);
      } catch (error: any) {
        console.error(`\n[session ${sessionId}] ===== START FAILED =====`);
        console.error(`[session ${sessionId}] Error:`, error);
        console.error(`[session ${sessionId}] Error message:`, error?.message);
        console.error(`[session ${sessionId}] Error stack:`, error?.stack);
        console.error(`[session ${sessionId}] Error code:`, error?.code);
        console.error(`[session ${sessionId}] Error name:`, error?.name);
        console.error(
          `[session ${sessionId}] Full error object:`,
          JSON.stringify(error, Object.getOwnPropertyNames(error)),
        );
        console.error(
          `[session ${sessionId}] ================================\n`,
        );

        if (ws.readyState === WebSocket.OPEN) {
          ws.send(
            JSON.stringify({
              type: "error",
              message: "Failed to start transcription",
              details: error?.message || String(error),
            }),
          );
        }
        ws.close();
      }
    };

    start();

    // Handle incoming WebSocket messages (both audio data and control commands)
    ws.on("message", (msg: Buffer | string) => {
      if (isPaused || isClosing) return;

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
                  lastDataAt = Date.now();
                  startPeriodicFlush();
                  scheduleSilenceTimer();
                })
                .catch((err) => {
                  console.error(
                    `[session ${sessionId}] Failed to resume:`,
                    err,
                  );
                });
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

      // If no stream, ignore audio
      if (!currentStream) {
        return;
      }

      try {
        // Speechmatics uses sendAudio method (sends binary data)
        // The sendAudio method will buffer if RecognitionStarted hasn't been received yet
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
        }
      } catch (e: any) {
        // Don't error on "Socket not ready" errors - just wait a bit
        if (e?.message?.includes("Socket not ready")) {
          // Audio will be buffered by the sendAudio wrapper - silently handle
          return;
        }
        console.warn(`[session ${sessionId}] Write failed:`, e);
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
