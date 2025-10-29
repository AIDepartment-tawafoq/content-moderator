// Based on javascript_websocket blueprint
import type { Express } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { storage } from "./storage";
import { insertSessionSchema } from "@shared/schema";
import speech from "@google-cloud/speech";
import crypto from "crypto";

// Simple in-memory session store for admin authentication
const adminSessions = new Map<string, { createdAt: number }>();
const SESSION_TIMEOUT = 24 * 60 * 60 * 1000; // 24 hours

// Helper to generate secure random token
function generateToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

// Helper to validate admin token
function isValidAdminToken(token: string): boolean {
  const session = adminSessions.get(token);
  if (!session) return false;
  
  // Check if session expired
  if (Date.now() - session.createdAt > SESSION_TIMEOUT) {
    adminSessions.delete(token);
    return false;
  }
  
  return true;
}

// Clean up expired sessions periodically
setInterval(() => {
  const now = Date.now();
  for (const [token, session] of adminSessions.entries()) {
    if (now - session.createdAt > SESSION_TIMEOUT) {
      adminSessions.delete(token);
    }
  }
}, 60 * 60 * 1000); // Clean every hour

export async function registerRoutes(app: Express): Promise<Server> {
  const httpServer = createServer(app);

  // Verify Google credentials are available
  if (!process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON) {
    console.error("=".repeat(80));
    console.error("CRITICAL ERROR: GOOGLE_APPLICATION_CREDENTIALS_JSON is missing!");
    console.error("The application cannot function without Google Cloud credentials.");
    console.error("Please add your Google Cloud Service Account JSON to Replit Secrets.");
    console.error("=".repeat(80));
    throw new Error("Missing required environment variable: GOOGLE_APPLICATION_CREDENTIALS_JSON");
  }

  // إنشاء WebSocket server على مسار منفصل
  // Based on javascript_websocket blueprint
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });

  // إعداد Google Speech-to-Text client
  let speechClient: speech.v1.SpeechClient;
  try {
    const credentials = JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON);
    if (!credentials.type || !credentials.project_id) {
      throw new Error("Invalid credentials format - missing required fields");
    }
    speechClient = new speech.SpeechClient({ credentials });
    console.log("✓ Google Speech-to-Text client initialized successfully");
    console.log(`  Project ID: ${credentials.project_id}`);
  } catch (error: any) {
    console.error("✗ Failed to initialize Google Speech-to-Text client:", error.message);
    throw error;
  }

  // API endpoint: إنشاء جلسة جديدة
  app.post("/api/sessions/init", async (req, res) => {
    try {
      const validatedData = insertSessionSchema.parse(req.body);
      const session = await storage.createSession(validatedData);
      
      res.json({
        sessionId: session.id,
        status: "success"
      });
    } catch (error: any) {
      console.error("Error creating session:", error);
      res.status(400).json({ 
        error: "فشل في إنشاء الجلسة", 
        details: error.message 
      });
    }
  });

  // API endpoint: الحصول على معلومات الجلسة
  app.get("/api/sessions/:id", async (req, res) => {
    try {
      const session = await storage.getSession(req.params.id);
      if (!session) {
        return res.status(404).json({ error: "الجلسة غير موجودة" });
      }
      res.json(session);
    } catch (error: any) {
      console.error("Error fetching session:", error);
      res.status(500).json({ 
        error: "خطأ في جلب بيانات الجلسة", 
        details: error.message 
      });
    }
  });

  // Admin authentication endpoint
  app.post("/api/admin/login", async (req, res) => {
    try {
      const { username, password } = req.body;
      
      // Get credentials from environment - REQUIRED for security
      const adminUsername = process.env.ADMIN_USERNAME;
      const adminPassword = process.env.ADMIN_PASSWORD;
      
      if (!adminUsername || !adminPassword) {
        console.error("SECURITY WARNING: ADMIN_USERNAME and ADMIN_PASSWORD must be set in environment");
        // Use default credentials only in development
        if (process.env.NODE_ENV === "development") {
          console.warn("Using development default credentials - NOT FOR PRODUCTION");
        } else {
          return res.status(500).json({ 
            error: "خطأ في الإعداد", 
            details: "Admin credentials not configured" 
          });
        }
      }
      
      const validUsername = adminUsername || "moslehadmin";
      const validPassword = adminPassword || "m@2025AtAOt";
      
      if (username === validUsername && password === validPassword) {
        // Generate a secure random token
        const token = generateToken();
        
        // Store session with timestamp
        adminSessions.set(token, { createdAt: Date.now() });
        
        res.json({ 
          success: true, 
          message: "تم تسجيل الدخول بنجاح",
          token 
        });
      } else {
        res.status(401).json({ success: false, error: "اسم المستخدم أو كلمة المرور غير صحيحة" });
      }
    } catch (error: any) {
      console.error("Error during admin login:", error);
      res.status(500).json({ error: "خطأ في تسجيل الدخول", details: error.message });
    }
  });

  // Admin endpoint: Get all sessions
  app.get("/api/admin/sessions", async (req, res) => {
    try {
      // Verify admin token
      const authHeader = req.headers.authorization;
      const token = authHeader?.replace('Bearer ', '');
      
      if (!token || !isValidAdminToken(token)) {
        return res.status(401).json({ error: "غير مصرح - يرجى تسجيل الدخول مرة أخرى" });
      }

      const sessions = await storage.getAllSessions();
      res.json(sessions);
    } catch (error: any) {
      console.error("Error fetching all sessions:", error);
      res.status(500).json({ 
        error: "خطأ في جلب الجلسات", 
        details: error.message 
      });
    }
  });

  // Admin endpoint: Export sessions as CSV
  app.get("/api/admin/sessions/export", async (req, res) => {
    try {
      // Verify admin token
      const authHeader = req.headers.authorization;
      const token = authHeader?.replace('Bearer ', '');
      
      if (!token || !isValidAdminToken(token)) {
        return res.status(401).json({ error: "غير مصرح - يرجى تسجيل الدخول مرة أخرى" });
      }

      const sessions = await storage.getAllSessions();
      
      // Build CSV content
      const headers = [
        "ID",
        "اسم المشارك",
        "تاريخ الموافقة",
        "تاريخ الجلسة",
        "عدد الأطراف",
        "نوع العلاقة",
        "يوجد أطفال متأثرون",
        "رقم الجلسة",
        "طبيعة المشكلة",
        "النص المحول",
        "الحالة",
        "تاريخ الاكتمال",
        "تاريخ الإنشاء"
      ];
      
      const csvRows = [headers.join(",")];
      
      sessions.forEach((session) => {
        const row = [
          session.id,
          session.participantName || "",
          session.consentedAt ? new Date(session.consentedAt).toLocaleString('ar-SA') : "",
          session.sessionDate ? new Date(session.sessionDate).toLocaleString('ar-SA') : "",
          session.participantsCount,
          session.relationType,
          session.hasAffectedChildren ? "نعم" : "لا",
          session.sessionNumber,
          session.problemNature || "",
          session.transcribedText ? `"${session.transcribedText.replace(/"/g, '""')}"` : "",
          session.status,
          session.completedAt ? new Date(session.completedAt).toLocaleString('ar-SA') : "",
          new Date(session.createdAt).toLocaleString('ar-SA')
        ];
        csvRows.push(row.join(","));
      });
      
      const csvContent = csvRows.join("\n");
      
      // Set headers for file download
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="sessions-export.csv"');
      res.setHeader('Content-Length', Buffer.byteLength(csvContent, 'utf8'));
      
      // Send BOM for Excel UTF-8 recognition
      res.write('\uFEFF');
      res.end(csvContent);
    } catch (error: any) {
      console.error("Error exporting sessions:", error);
      res.status(500).json({ 
        error: "خطأ في تصدير الجلسات", 
        details: error.message 
      });
    }
  });

  // WebSocket handler: التحويل الصوتي الفوري
  wss.on('connection', (ws: WebSocket, req) => {
    console.log('New WebSocket connection established');
    
    const url = new URL(req.url || '', `http://${req.headers.host}`);
    const sessionId = url.searchParams.get('sessionId');
    
    if (!sessionId) {
      ws.close(1008, 'Missing sessionId parameter');
      return;
    }

    let accumulatedTranscript = '';
    let recognizeStream: any = null;
    let silenceTimer: NodeJS.Timeout | null = null;
    const SILENCE_TIMEOUT = 300000; // 5 دقائق من الصمت (300 ثانية)

    // إنشاء streaming recognition request مع speaker diarization
    // Using LINEAR16 PCM at 16kHz from AudioWorklet
    const request = {
      config: {
        encoding: 'LINEAR16' as const,
        sampleRateHertz: 16000,
        languageCode: 'ar-SA', // اللغة العربية - السعودية
        alternativeLanguageCodes: ['ar-AE', 'ar-EG'], // لهجات عربية أخرى
        enableAutomaticPunctuation: true,
        model: 'default',
        diarizationConfig: {
          enableSpeakerDiarization: true,
          minSpeakerCount: 2,
          maxSpeakerCount: 4,
        },
      },
      interimResults: true,
    };

    // إنشاء stream للتحويل الصوتي
    const startRecognitionStream = () => {
      recognizeStream = speechClient
        .streamingRecognize(request)
        .on('error', (error: Error) => {
          console.error('Speech recognition error:', error);
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ 
              type: 'error', 
              message: 'خطأ في التحويل الصوتي' 
            }));
          }
        })
        .on('data', async (data: any) => {
          const result = data.results[0];
          if (result && result.alternatives[0]) {
            const transcript = result.alternatives[0].transcript;
            
            if (result.isFinal) {
              // نص نهائي - إضافته للنص المتراكم
              accumulatedTranscript += transcript + ' ';
              
              // حفظ في قاعدة البيانات
              try {
                await storage.updateSessionTranscript(sessionId, accumulatedTranscript);
                console.log(`Transcript updated for session ${sessionId}: "${transcript}"`);
              } catch (error) {
                console.error('Error updating transcript:', error);
              }

              // إرسال للعميل
              if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ 
                  type: 'transcript', 
                  text: transcript,
                  isFinal: true 
                }));
              }

              // إعادة تعيين مؤقت الصمت
              resetSilenceTimer();
            } else {
              // نتائج مؤقتة
              if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ 
                  type: 'transcript', 
                  text: transcript,
                  isFinal: false 
                }));
              }
            }
          }
        });
    };

    // إعادة تعيين مؤقت الصمت
    const resetSilenceTimer = () => {
      if (silenceTimer) {
        clearTimeout(silenceTimer);
      }
      
      silenceTimer = setTimeout(async () => {
        console.log('Silence detected, ending session:', sessionId);
        
        // إنهاء الجلسة
        try {
          await storage.completeSession(sessionId);
        } catch (error) {
          console.error('Error completing session:', error);
        }

        // إغلاق الاتصال
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ 
            type: 'session_complete', 
            transcript: accumulatedTranscript 
          }));
          ws.close(1000, 'Session completed due to silence');
        }
      }, SILENCE_TIMEOUT);
    };

    // بدء stream التحويل الصوتي
    startRecognitionStream();
    resetSilenceTimer();

    // استقبال البيانات الصوتية من العميل
    ws.on('message', (message: Buffer) => {
      if (recognizeStream && !recognizeStream.destroyed) {
        try {
          // إرسال audio chunks فقط (config تم إرساله مسبقاً عند إنشاء الـ stream)
          // Google Speech API expects raw audio buffer after initial config
          recognizeStream.write(message);
          
          // إعادة تعيين مؤقت الصمت عند استقبال صوت
          resetSilenceTimer();
        } catch (error) {
          console.error('Error writing to recognition stream:', error);
          // إرسال الخطأ للعميل
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ 
              type: 'error', 
              message: 'خطأ في معالجة الصوت' 
            }));
          }
        }
      }
    });

    // التعامل مع إغلاق الاتصال
    ws.on('close', async () => {
      console.log('WebSocket connection closed for session:', sessionId);
      
      if (silenceTimer) {
        clearTimeout(silenceTimer);
      }

      if (recognizeStream && !recognizeStream.destroyed) {
        recognizeStream.end();
      }

      // حفظ النص النهائي وإكمال الجلسة
      try {
        if (accumulatedTranscript) {
          await storage.updateSessionTranscript(sessionId, accumulatedTranscript);
        }
        await storage.completeSession(sessionId);
      } catch (error) {
        console.error('Error finalizing session:', error);
      }
    });

    // التعامل مع الأخطاء
    ws.on('error', (error) => {
      console.error('WebSocket error:', error);
    });
  });

  return httpServer;
}
