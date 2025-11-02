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

type Phase = "cta" | "recording" | "survey" | "done";

// Survey form schema (للمستشار بعد انتهاء الجلسة)
const surveyFormSchema = z.object({
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
  const isPausedRef = useRef(false); // Use ref to avoid closure issues in audio callbacks
  
  const { toast } = useToast();

  // Survey form (يتم ملؤه من قبل المستشار بعد الجلسة)
  const surveyForm = useForm<z.infer<typeof surveyFormSchema>>({
    resolver: zodResolver(surveyFormSchema),
    defaultValues: {
      sessionDate: new Date().toISOString().split('T')[0],
      participantsCount: 2,
      relationType: "زوجان",
      hasAffectedChildren: false,
      sessionNumber: "الأولى",
      problemNature: "خلافات زوجية",
      sessionEffectiveness: "فعالة",
      reconciliationProgress: "تقدم جيد",
      counselorNotes: "",
    },
  });

  // بدء التسجيل مباشرة من صفحة CTA
  const startRecording = async () => {
    try {
      setError("");
      
      // Create new session on server (no form data needed)
      const res = await apiRequest("POST", "/api/sessions/init", {});

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
            if (ws.readyState === WebSocket.OPEN && !isPausedRef.current) {
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
            if (ws.readyState === WebSocket.OPEN && !isPausedRef.current) {
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
    setPhase("survey"); // Go to survey phase for counselor to fill
    setRecordingStatus("");
  };

  // Toggle pause/resume recording
  const togglePauseRecording = () => {
    const ws = wsRef.current;
    
    if (isPaused) {
      // Resume - send resume command to server
      setIsPaused(false);
      isPausedRef.current = false; // Sync ref with state
      setRecordingStatus("يتم الآن الاستماع (لا يتم حفظ الصوت)");
      
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'resume' }));
      }
      
      toast({
        title: "تم استئناف التسجيل",
        description: "التسجيل قيد العمل الآن",
      });
    } else {
      // Pause - send pause command to server
      setIsPaused(true);
      isPausedRef.current = true; // Sync ref with state
      setRecordingStatus("التسجيل متوقف مؤقتاً");
      
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'pause' }));
      }
      
      toast({
        title: "تم إيقاف التسجيل مؤقتاً",
        description: "يمكنك استئناف التسجيل في أي وقت",
      });
    }
  };

  // Reset session for next counselor session
  const resetSession = () => {
    setPhase("cta");
    setIsDimmed(false);
    setIsRecording(false);
    setRecordingStatus("");
    setCurrentTranscript("");
    setError("");
    sessionIdRef.current = "";
    setIsPaused(false);
    isPausedRef.current = false;
    
    // Reset survey form
    surveyForm.reset({
      sessionDate: new Date().toISOString().split('T')[0],
      participantsCount: 2,
      relationType: "زوجان",
      hasAffectedChildren: false,
      sessionNumber: "الأولى",
      problemNature: "خلافات زوجية",
      sessionEffectiveness: "فعالة",
      reconciliationProgress: "تقدم جيد",
      counselorNotes: "",
    });
  };

  // Handle survey form submission (after recording)
  const onSurveySubmit = async (data: z.infer<typeof surveyFormSchema>) => {
    try {
      setError("");
      
      // Update session with survey data
      const res = await apiRequest(
        "POST",
        `/api/sessions/${sessionIdRef.current}/complete`,
        data
      );

      const response = await res.json();

      if (!response.success) {
        throw new Error("فشل في حفظ بيانات الجلسة");
      }

      toast({
        title: "تم حفظ البيانات بنجاح",
        description: "تم حفظ بيانات الجلسة وتقييمك",
      });

      setPhase("done");

      // Reset after 5 seconds
      setTimeout(() => {
        resetSession();
      }, 5000);

    } catch (err: any) {
      console.error("Error saving survey data:", err);
      const errorMessage = err.message || "فشل في حفظ البيانات";
      setError(errorMessage);
      toast({
        title: "خطأ",
        description: errorMessage,
        variant: "destructive",
      });
    }
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
                onClick={startRecording}
                className="w-full rounded-xl h-12 text-base font-semibold hover-elevate active-elevate-2"
                data-testid="button-start-recording"
              >
                بدء جلسة جديدة
                <Mic className="w-5 h-5 mr-2" />
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Phase 2: Survey (للمستشار بعد انتهاء التسجيل) */}
        {phase === "survey" && (
          <Card className="shadow-xl" data-testid="card-survey">
            <CardHeader className="p-6 md:p-8">
              <CardTitle className="text-xl md:text-2xl font-semibold mb-2 font-arabic-display">
                تقييم الجلسة
              </CardTitle>
              <CardDescription className="text-sm font-arabic">
                يرجى ملء البيانات التالية لتوثيق الجلسة وتقييمها
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

                  {/* Problem nature */}
                  <FormField
                    control={surveyForm.control}
                    name="problemNature"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="font-arabic">طبيعة المشكلة</FormLabel>
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

                  {/* Session Effectiveness (Counselor Evaluation) */}
                  <FormField
                    control={surveyForm.control}
                    name="sessionEffectiveness"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="font-arabic">تقييم فعالية الجلسة</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger
                              className="h-11 font-arabic"
                              data-testid="select-session-effectiveness"
                            >
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent className="font-arabic">
                            <SelectItem value="فعالة جداً">فعالة جداً</SelectItem>
                            <SelectItem value="فعالة">فعالة</SelectItem>
                            <SelectItem value="متوسطة">متوسطة</SelectItem>
                            <SelectItem value="غير فعالة">غير فعالة</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage className="font-arabic" />
                      </FormItem>
                    )}
                  />

                  {/* Reconciliation Progress (Counselor Evaluation) */}
                  <FormField
                    control={surveyForm.control}
                    name="reconciliationProgress"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="font-arabic">تقدم المصالحة</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger
                              className="h-11 font-arabic"
                              data-testid="select-reconciliation-progress"
                            >
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent className="font-arabic">
                            <SelectItem value="تقدم ممتاز">تقدم ممتاز</SelectItem>
                            <SelectItem value="تقدم جيد">تقدم جيد</SelectItem>
                            <SelectItem value="تقدم ضعيف">تقدم ضعيف</SelectItem>
                            <SelectItem value="لا يوجد تقدم">لا يوجد تقدم</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage className="font-arabic" />
                      </FormItem>
                    )}
                  />

                  {/* Counselor Notes (Optional) */}
                  <FormField
                    control={surveyForm.control}
                    name="counselorNotes"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="font-arabic">ملاحظات المستشار (اختياري)</FormLabel>
                        <FormControl>
                          <Textarea
                            {...field}
                            placeholder="أضف أي ملاحظات أو تعليقات حول الجلسة"
                            className="min-h-[100px] font-arabic"
                            data-testid="textarea-counselor-notes"
                          />
                        </FormControl>
                        <FormMessage className="font-arabic" />
                      </FormItem>
                    )}
                  />

                  {/* Submit button */}
                  <div className="flex justify-end pt-2">
                    <Button
                      type="submit"
                      className="px-8 font-arabic hover-elevate active-elevate-2"
                      data-testid="button-submit-survey"
                    >
                      حفظ البيانات
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
            className={`text-center space-y-6 transition-opacity duration-700 ${
              phase === "recording" ? "opacity-100" : "opacity-0"
            }`}
          >
            {isRecording && (
              <>
                {/* Calm status indicator - no pulsing icon */}
                <div className="flex flex-col items-center gap-4">
                  {/* Gentle animated dots */}
                  <div className="flex gap-2" data-testid="recording-indicator">
                    <div className="w-3 h-3 rounded-full bg-teal-400/60 animate-bounce-slow"></div>
                    <div className="w-3 h-3 rounded-full bg-teal-400/60 animate-bounce-slow" style={{ animationDelay: '0.2s' }}></div>
                    <div className="w-3 h-3 rounded-full bg-teal-400/60 animate-bounce-slow" style={{ animationDelay: '0.4s' }}></div>
                  </div>
                  
                  {/* Reassuring message */}
                  <div className="space-y-2">
                    <p className="text-xl text-teal-100 font-arabic font-semibold" data-testid="text-session-status">
                      {isPaused ? "الجلسة متوقفة مؤقتاً" : "جلستكم محمية وآمنة"}
                    </p>
                    <p className="text-sm text-gray-300 font-arabic" data-testid="text-recording-status">
                      {isPaused ? "يمكنك استئناف الجلسة في أي وقت" : "يتم تحويل الكلام إلى نص فقط - لا يتم حفظ الصوت"}
                    </p>
                  </div>

                  {/* Info about automatic completion */}
                  {!isPaused && (
                    <div className="px-4 py-2 bg-white/5 rounded-lg border border-white/10">
                      <p className="text-xs text-gray-400 font-arabic">
                        ستنتهي الجلسة تلقائياً بعد 5 دقائق من الصمت
                      </p>
                    </div>
                  )}
                </div>

                {/* Control buttons */}
                <div className="flex gap-3 pointer-events-auto">
                  {/* Pause/Resume button */}
                  <Button
                    variant="outline"
                    onClick={togglePauseRecording}
                    className="bg-white/10 hover:bg-white/20 text-white border-white/30 font-arabic px-6"
                    data-testid="button-toggle-recording"
                  >
                    {isPaused ? (
                      <>
                        <Play className="w-4 h-4 ml-2" />
                        استئناف الجلسة
                      </>
                    ) : (
                      <>
                        <Pause className="w-4 h-4 ml-2" />
                        إيقاف مؤقت
                      </>
                    )}
                  </Button>

                  {/* Finish session button */}
                  <Button
                    variant="outline"
                    onClick={stopRecording}
                    className="bg-green-500/20 hover:bg-green-500/30 text-green-100 border-green-400/30 font-arabic px-6"
                    data-testid="button-finish-session"
                  >
                    <Check className="w-4 h-4 ml-2" />
                    إنهاء الجلسة
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
