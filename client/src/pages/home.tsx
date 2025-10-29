import { useState, useRef, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Mic, Shield, Check, ChevronRight, AlertCircle, X, Pause, Play } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Link } from "wouter";
import logoImage from "@assets/logo-tawafoq_1761731886969.png";

type Phase = "cta" | "consent" | "survey" | "recording" | "done";

// Consent form schema
const consentFormSchema = z.object({
  participantName: z.string().optional(),
  consented: z.boolean().refine((val) => val === true, {
    message: "يجب الموافقة على الشروط للمتابعة",
  }),
});

// Survey form schema
const surveyFormSchema = z.object({
  sessionDate: z.string().min(1, "يرجى اختيار تاريخ الجلسة"),
  participantsCount: z.number().min(1, "يجب أن يكون العدد 1 على الأقل").max(10, "الحد الأقصى 10 أطراف"),
  relationType: z.enum(["زوجان", "أقارب", "والد وابنه", "أخرى"]),
  hasAffectedChildren: z.boolean(),
  sessionNumber: z.enum(["الأولى", "الثانية", "الثالثة", "أكثر من ثلاث"]),
  problemNature: z.enum(["خلافات زوجية", "خلافات أسرية", "خلافات مالية", "خلافات على الحضانة", "خلافات أخرى"]).optional(),
});

export default function Home() {
  const [phase, setPhase] = useState<Phase>("cta");
  const [isDimmed, setIsDimmed] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [recordingStatus, setRecordingStatus] = useState("");
  const [currentTranscript, setCurrentTranscript] = useState("");
  const [error, setError] = useState<string>("");
  
  const wsRef = useRef<WebSocket | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioWorkletNodeRef = useRef<AudioWorkletNode | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const sessionIdRef = useRef<string>("");
  const consentDataRef = useRef<z.infer<typeof consentFormSchema>>();
  
  const { toast } = useToast();

  // Consent form
  const consentForm = useForm<z.infer<typeof consentFormSchema>>({
    resolver: zodResolver(consentFormSchema),
    defaultValues: {
      participantName: "",
      consented: false,
    },
  });

  // Survey form
  const surveyForm = useForm<z.infer<typeof surveyFormSchema>>({
    resolver: zodResolver(surveyFormSchema),
    defaultValues: {
      sessionDate: new Date().toISOString().split('T')[0],
      participantsCount: 2,
      relationType: "زوجان",
      hasAffectedChildren: false,
      sessionNumber: "الأولى",
      problemNature: undefined,
    },
  });

  // Handle consent form submission
  const onConsentSubmit = (data: z.infer<typeof consentFormSchema>) => {
    consentDataRef.current = data;
    setPhase("survey");
  };

  // Handle survey form submission and start recording
  const onSurveySubmit = async (data: z.infer<typeof surveyFormSchema>) => {
    try {
      setError("");
      
      // Create new session on server
      const res = await apiRequest(
        "POST",
        "/api/sessions/init",
        {
          participantName: consentDataRef.current?.participantName || undefined,
          sessionDate: data.sessionDate,
          participantsCount: data.participantsCount,
          relationType: data.relationType,
          hasAffectedChildren: data.hasAffectedChildren,
          sessionNumber: data.sessionNumber,
          problemNature: data.problemNature,
        }
      );

      const response = await res.json() as { sessionId: string };

      if (!response.sessionId) {
        throw new Error("فشل في الحصول على معرف الجلسة");
      }

      sessionIdRef.current = response.sessionId;

      // Start recording interface
      setIsDimmed(true);
      setPhase("recording");
      setIsRecording(true);
      setRecordingStatus("جارٍ الاتصال...");

      // Check for browser support
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error("المتصفح لا يدعم تسجيل الصوت. يرجى استخدام متصفح حديث.");
      }

      // Request microphone permission
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      mediaStreamRef.current = stream;

      // Create AudioContext (browser will use native sample rate, we'll downsample in AudioWorklet)
      const audioContext = new AudioContext();
      audioContextRef.current = audioContext;

      const source = audioContext.createMediaStreamSource(stream);

      // Connect to WebSocket
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const wsUrl = `${protocol}//${window.location.host}/ws?sessionId=${response.sessionId}`;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = async () => {
        console.log("WebSocket connected");
        setRecordingStatus("يتم الآن الاستماع (لا يتم حفظ الصوت)");

        try {
          // Load AudioWorklet module
          await audioContext.audioWorklet.addModule('/audio-processor.js');

          // Create AudioWorklet node
          const workletNode = new AudioWorkletNode(audioContext, 'audio-processor');
          audioWorkletNodeRef.current = workletNode;

          // Handle audio data from worklet
          workletNode.port.onmessage = (event) => {
            if (ws.readyState === WebSocket.OPEN && !isPaused) {
              // Send raw PCM16 buffer to server only if not paused
              ws.send(event.data);
            }
          };

          // Connect audio pipeline
          source.connect(workletNode);
          workletNode.connect(audioContext.destination);

        } catch (workletError: any) {
          console.error("AudioWorklet error, falling back to ScriptProcessor:", workletError);
          
          // Fallback to ScriptProcessorNode for older browsers
          const bufferSize = 4096;
          const processor = audioContext.createScriptProcessor(bufferSize, 1, 1);

          processor.onaudioprocess = (e) => {
            if (ws.readyState === WebSocket.OPEN && !isPaused) {
              const inputData = e.inputBuffer.getChannelData(0);
              
              // Simple downsampling: take every nth sample
              const downsampleRatio = Math.round(audioContext.sampleRate / 16000);
              const outputLength = Math.floor(inputData.length / downsampleRatio);
              const pcm16 = new Int16Array(outputLength);
              
              for (let i = 0; i < outputLength; i++) {
                const index = i * downsampleRatio;
                const s = Math.max(-1, Math.min(1, inputData[index]));
                pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
              }

              ws.send(pcm16.buffer);
            }
          };

          source.connect(processor);
          processor.connect(audioContext.destination);
        }
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);

          if (data.type === "transcript") {
            if (data.isFinal) {
              setCurrentTranscript((prev) => prev + data.text + " ");
            }
          } else if (data.type === "session_complete") {
            console.log("Session completed by server");
            stopRecording();
          } else if (data.type === "error") {
            console.error("Server error:", data.message);
            setError(data.message);
            toast({
              title: "خطأ",
              description: data.message,
              variant: "destructive",
            });
          }
        } catch (err) {
          console.error("Error parsing WebSocket message:", err);
        }
      };

      ws.onerror = (error) => {
        console.error("WebSocket error:", error);
        setError("خطأ في الاتصال بالخادم");
        stopRecording();
      };

      ws.onclose = () => {
        console.log("WebSocket closed");
      };

    } catch (err: any) {
      console.error("Error starting recording:", err);
      const errorMessage = err.message || "فشل في بدء التسجيل";
      setError(errorMessage);
      toast({
        title: "خطأ",
        description: errorMessage,
        variant: "destructive",
      });
      setIsDimmed(false);
      setPhase("survey");
    }
  };

  // Stop recording
  const stopRecording = () => {
    // Close WebSocket
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    // Stop media stream
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop());
      mediaStreamRef.current = null;
    }

    // Close AudioContext
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }

    // Cleanup worklet
    if (audioWorkletNodeRef.current) {
      audioWorkletNodeRef.current.disconnect();
      audioWorkletNodeRef.current = null;
    }

    setIsRecording(false);
    setIsDimmed(false);
    setPhase("done");
    setRecordingStatus("شكراً لمساهمتك، تم حفظ النص بأمان");

    // Reset after 5 seconds
    setTimeout(() => {
      resetSession();
    }, 5000);
  };

  // Toggle pause/resume recording
  const togglePauseRecording = () => {
    if (isPaused) {
      // Resume
      setIsPaused(false);
      setRecordingStatus("يتم الآن الاستماع (لا يتم حفظ الصوت)");
      toast({
        title: "تم استئناف التسجيل",
        description: "التسجيل قيد العمل الآن",
      });
    } else {
      // Pause
      setIsPaused(true);
      setRecordingStatus("التسجيل متوقف مؤقتاً");
      toast({
        title: "تم إيقاف التسجيل مؤقتاً",
        description: "يمكنك استئناف التسجيل في أي وقت",
      });
    }
  };

  // Reset session for next user
  const resetSession = () => {
    setPhase("cta");
    setIsDimmed(false);
    setIsRecording(false);
    setRecordingStatus("");
    setCurrentTranscript("");
    setError("");
    sessionIdRef.current = "";
    consentDataRef.current = undefined;
    
    // Reset forms
    consentForm.reset();
    surveyForm.reset({
      sessionDate: new Date().toISOString().split('T')[0],
      participantsCount: 2,
      relationType: "زوجان",
      hasAffectedChildren: false,
      sessionNumber: "الأولى",
      problemNature: undefined,
    });
  };

  // Cleanup resources on unmount
  useEffect(() => {
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach(track => track.stop());
      }
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    };
  }, []);

  return (
    <div
      dir="rtl"
      className={`min-h-screen flex items-center justify-center px-4 md:px-6 transition-colors duration-700 ${
        isDimmed ? "bg-black" : "bg-background"
      }`}
    >
      {/* Card content */}
      <div
        className={`w-full max-w-lg transition-opacity duration-700 ${
          isDimmed && phase === "recording" ? "opacity-0 pointer-events-none" : "opacity-100"
        }`}
      >
        {/* Phase 1: Call-to-Action */}
        {phase === "cta" && (
          <Card className="shadow-xl" data-testid="card-cta">
            <CardHeader className="space-y-4 p-6 md:p-8">
              {/* Logo */}
              <div className="flex justify-center mb-2">
                <img 
                  src={logoImage} 
                  alt="شعار التوافق" 
                  className="h-16 w-auto object-contain"
                  data-testid="img-logo"
                />
              </div>
              
              <div className="flex items-start gap-3">
                <div className="rounded-full bg-primary/10 p-3">
                  <Shield className="w-6 h-6 text-primary" />
                </div>
                <div className="flex-1">
                  <CardTitle className="text-2xl md:text-3xl font-bold leading-relaxed mb-2 font-arabic-display">
                    شارك تجربتك بسرية لتحسين خدماتنا
                  </CardTitle>
                  <CardDescription className="text-base md:text-lg leading-relaxed font-arabic">
                    سيتم تحويل كلامك إلى نص بشكل فوري لتحسين خدماتنا. لا يتم حفظ أي تسجيل صوتي.
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-6 md:p-8 pt-0">
              <Button
                onClick={() => setPhase("consent")}
                className="w-full rounded-xl h-12 text-base font-semibold hover-elevate active-elevate-2"
                data-testid="button-start-sharing"
              >
                ابدأ المشاركة الآن
                <ChevronRight className="w-5 h-5 mr-2 rotate-180" />
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Phase 2: Consent */}
        {phase === "consent" && (
          <Card className="shadow-xl" data-testid="card-consent">
            <CardHeader className="p-6 md:p-8">
              <CardTitle className="text-xl md:text-2xl font-semibold mb-4 font-arabic-display">
                الموافقة على التسجيل
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6 md:p-8 pt-0">
              <Form {...consentForm}>
                <form onSubmit={consentForm.handleSubmit(onConsentSubmit)} className="space-y-6">
                  {/* Consent points */}
                  <div className="border rounded-lg p-4 bg-muted/30">
                    <ul className="list-disc pr-5 space-y-2 text-sm md:text-base leading-relaxed font-arabic">
                      <li>سيتم تحويل الجلسة إلى نص لأغراض البحث وتحسين الخدمة فقط.</li>
                      <li>لن يتم حفظ أي تسجيل صوتي بعد تحويله.</li>
                      <li>المشاركة اختيارية ولا تؤثر على خدماتك.</li>
                      <li>جميع البيانات محمية وفق سياسات الخصوصية الصارمة.</li>
                      <li>يمكنك إيقاف المشاركة في أي وقت.</li>
                    </ul>
                  </div>

                  {/* Optional name field */}
                  <FormField
                    control={consentForm.control}
                    name="participantName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="font-arabic">الاسم (اختياري)</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            placeholder="أدخل اسمك هنا"
                            className="h-11 px-4 font-arabic"
                            data-testid="input-participant-name"
                          />
                        </FormControl>
                        <FormMessage className="font-arabic" />
                      </FormItem>
                    )}
                  />

                  {/* Privacy Policy Link */}
                  <div className="p-4 rounded-lg bg-muted/30 border">
                    <p className="text-sm leading-relaxed font-arabic mb-2">
                      قبل الموافقة، يرجى قراءة{" "}
                      <Link href="/privacy-policy">
                        <a className="text-primary hover:underline font-semibold" data-testid="link-privacy-policy">
                          سياسة الخصوصية وحماية البيانات
                        </a>
                      </Link>
                      {" "}للتعرف على كيفية معالجة بياناتك وفقاً لنظام حماية البيانات الشخصية (PDPL).
                    </p>
                  </div>

                  {/* Consent checkbox */}
                  <FormField
                    control={consentForm.control}
                    name="consented"
                    render={({ field }) => (
                      <FormItem className="flex items-start gap-3 p-4 border rounded-lg hover-elevate">
                        <FormControl>
                          <Checkbox
                            checked={field.value}
                            onCheckedChange={field.onChange}
                            className="w-5 h-5 mt-0.5"
                            data-testid="checkbox-consent"
                          />
                        </FormControl>
                        <div className="flex-1">
                          <FormLabel className="text-sm leading-relaxed cursor-pointer font-arabic">
                            أوافق على الشروط وسياسة الخصوصية وأؤكد رغبتي في المشاركة الطوعية
                          </FormLabel>
                          <FormMessage className="font-arabic mt-1" />
                        </div>
                      </FormItem>
                    )}
                  />

                  {/* Navigation buttons */}
                  <div className="flex gap-3 justify-end pt-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setPhase("cta")}
                      className="px-6 font-arabic"
                      data-testid="button-back-to-cta"
                    >
                      رجوع
                    </Button>
                    <Button
                      type="submit"
                      className="px-6 font-arabic hover-elevate active-elevate-2"
                      data-testid="button-next-to-survey"
                    >
                      التالي
                      <ChevronRight className="w-4 h-4 mr-2 rotate-180" />
                    </Button>
                  </div>
                </form>
              </Form>
            </CardContent>
          </Card>
        )}

        {/* Phase 3: Survey */}
        {phase === "survey" && (
          <Card className="shadow-xl" data-testid="card-survey">
            <CardHeader className="p-6 md:p-8">
              <CardTitle className="text-xl md:text-2xl font-semibold mb-2 font-arabic-display">
                الاستبيان القصير
              </CardTitle>
              <CardDescription className="text-sm font-arabic">
                ساعدنا في فهم سياق الجلسة لتحسين خدماتنا
              </CardDescription>
            </CardHeader>
            <CardContent className="p-6 md:p-8 pt-0">
              {error && (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 text-destructive mb-6">
                  <AlertCircle className="w-4 h-4" />
                  <p className="text-sm font-arabic">{error}</p>
                </div>
              )}

              <Form {...surveyForm}>
                <form onSubmit={surveyForm.handleSubmit(onSurveySubmit)} className="space-y-6">
                  {/* Session date */}
                  <FormField
                    control={surveyForm.control}
                    name="sessionDate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="font-arabic">تاريخ الجلسة</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            type="date"
                            className="h-11 px-4 font-arabic"
                            data-testid="input-session-date"
                          />
                        </FormControl>
                        <FormMessage className="font-arabic" />
                      </FormItem>
                    )}
                  />

                  {/* Participants count */}
                  <FormField
                    control={surveyForm.control}
                    name="participantsCount"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="font-arabic">عدد الأطراف في الجلسة</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            type="number"
                            min={1}
                            max={10}
                            onChange={(e) => field.onChange(parseInt(e.target.value) || 1)}
                            className="h-11 px-4 font-arabic"
                            data-testid="input-participants-count"
                          />
                        </FormControl>
                        <FormMessage className="font-arabic" />
                      </FormItem>
                    )}
                  />

                  {/* Relation type */}
                  <FormField
                    control={surveyForm.control}
                    name="relationType"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="font-arabic">نوع العلاقة</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger
                              className="h-11 font-arabic"
                              data-testid="select-relation-type"
                            >
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent className="font-arabic">
                            <SelectItem value="زوجان">زوجان</SelectItem>
                            <SelectItem value="أقارب">أقارب</SelectItem>
                            <SelectItem value="والد وابنه">والد وابنه</SelectItem>
                            <SelectItem value="أخرى">أخرى</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage className="font-arabic" />
                      </FormItem>
                    )}
                  />

                  {/* Affected children */}
                  <FormField
                    control={surveyForm.control}
                    name="hasAffectedChildren"
                    render={({ field }) => (
                      <FormItem className="flex items-start gap-3 p-4 border rounded-lg hover-elevate">
                        <FormControl>
                          <Checkbox
                            checked={field.value}
                            onCheckedChange={field.onChange}
                            className="w-5 h-5 mt-0.5"
                            data-testid="checkbox-affected-children"
                          />
                        </FormControl>
                        <div className="flex-1">
                          <FormLabel className="text-sm leading-relaxed cursor-pointer font-arabic">
                            هل يوجد أطفال متأثرون بالخلاف؟
                          </FormLabel>
                        </div>
                      </FormItem>
                    )}
                  />

                  {/* Session number */}
                  <FormField
                    control={surveyForm.control}
                    name="sessionNumber"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="font-arabic">رقم الجلسة</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger
                              className="h-11 font-arabic"
                              data-testid="select-session-number"
                            >
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent className="font-arabic">
                            <SelectItem value="الأولى">الأولى</SelectItem>
                            <SelectItem value="الثانية">الثانية</SelectItem>
                            <SelectItem value="الثالثة">الثالثة</SelectItem>
                            <SelectItem value="أكثر من ثلاث">أكثر من ثلاث</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage className="font-arabic" />
                      </FormItem>
                    )}
                  />

                  {/* Problem nature (optional) */}
                  <FormField
                    control={surveyForm.control}
                    name="problemNature"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="font-arabic">طبيعة المشكلة (اختياري)</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger
                              className="h-11 font-arabic"
                              data-testid="select-problem-nature"
                            >
                              <SelectValue placeholder="اختر طبيعة المشكلة" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent className="font-arabic">
                            <SelectItem value="خلافات زوجية">خلافات زوجية</SelectItem>
                            <SelectItem value="خلافات أسرية">خلافات أسرية</SelectItem>
                            <SelectItem value="خلافات مالية">خلافات مالية</SelectItem>
                            <SelectItem value="خلافات على الحضانة">خلافات على الحضانة</SelectItem>
                            <SelectItem value="خلافات أخرى">خلافات أخرى</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage className="font-arabic" />
                      </FormItem>
                    )}
                  />

                  {/* Navigation buttons */}
                  <div className="flex gap-3 justify-end pt-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setPhase("consent")}
                      className="px-6 font-arabic"
                      data-testid="button-back-to-consent"
                    >
                      رجوع
                    </Button>
                    <Button
                      type="submit"
                      className="px-6 font-arabic hover-elevate active-elevate-2"
                      data-testid="button-start-recording"
                    >
                      <Mic className="w-4 h-4 ml-2" />
                      ابدأ الجلسة
                    </Button>
                  </div>
                </form>
              </Form>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Phase 4 & 5: Recording indicator and thank you message */}
      {(phase === "recording" || phase === "done") && (
        <div className="fixed inset-0 flex flex-col items-center justify-center gap-8 pointer-events-none">
          <div
            className={`text-center space-y-3 transition-opacity duration-700 ${
              phase === "recording" ? "opacity-100" : "opacity-0"
            }`}
          >
            {isRecording && (
              <>
                <div className="flex justify-center">
                  <div className="rounded-full bg-red-500/20 p-4 animate-pulse-slow">
                    <Mic className="w-8 h-8 text-red-400" data-testid="icon-recording" />
                  </div>
                </div>
                <p className="text-sm text-gray-300 font-arabic" data-testid="text-recording-status">
                  {recordingStatus}
                </p>
                {/* Pause/Resume button */}
                <div className="pt-4 pointer-events-auto">
                  <Button
                    variant="outline"
                    onClick={togglePauseRecording}
                    className="bg-white/10 hover:bg-white/20 text-white border-white/30 font-arabic"
                    data-testid="button-toggle-recording"
                  >
                    {isPaused ? (
                      <>
                        <Play className="w-4 h-4 ml-2" />
                        استئناف التسجيل
                      </>
                    ) : (
                      <>
                        <Pause className="w-4 h-4 ml-2" />
                        وقف التسجيل
                      </>
                    )}
                  </Button>
                </div>
              </>
            )}
          </div>
          
          {phase === "done" && (
            <div className="text-center space-y-3 animate-in fade-in duration-700">
              <div className="flex justify-center">
                <div className="rounded-full bg-green-500/20 p-4">
                  <Check className="w-8 h-8 text-green-400" data-testid="icon-completed" />
                </div>
              </div>
              <p className="text-sm text-green-100 font-arabic" data-testid="text-completion-message">
                شكراً لمساهمتك، تم حفظ النص بأمان
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
