# منصة تسجيل جلسات المصالحة العربية
# Arabic Session Recording Platform

## نظرة عامة | Overview

منصة ويب عربية تعطي الأولوية للخصوصية لتسجيل وتحويل جلسات الاستشارة/الوساطة إلى نص. تجمع المنصة موافقة المستخدم، وتجمع البيانات الوصفية للجلسة من خلال استبيان قصير، ثم تقوم بتحويل الكلام إلى نص في الوقت الفعلي باستخدام Google Cloud Speech API. **لا يتم تخزين أي ملفات صوتية** - يتم حفظ النص المحول فقط في قاعدة البيانات لأغراض تحسين الخدمة.

An Arabic-first privacy-focused web application for recording and transcribing counseling/mediation sessions. The platform collects user consent, gathers session metadata through a brief survey, then performs real-time speech-to-text conversion using Google Cloud Speech API. **No audio files are stored** - only the transcribed text is saved to the database for service improvement purposes.

التطبيق يركز على الثقة والخصوصية والحساسية الثقافية مع تصميم هادئ واحترافي مصمم للمستخدمين الناطقين بالعربية.

The application emphasizes trust, privacy, and cultural sensitivity with a calm, professional design tailored for Arabic-speaking users.

---

## التحديثات الأخيرة | Recent Changes (October 29, 2025)

### ✅ التحسينات المنجزة | Completed Improvements

1. **معالجة الصوت المحسنة | Enhanced Audio Processing**
   - تم تطبيق AudioWorklet لمعالجة الصوت بجودة عالية
   - Downsampling تلقائي إلى 16kHz LINEAR16 PCM
   - Fallback إلى ScriptProcessorNode للمتصفحات القديمة
   - ملف `/audio-processor.js` للمعالجة في الخلفية

2. **إصلاح تكامل Google Speech-to-Text**
   - تم إصلاح تنسيق البيانات: `{ audioContent: Buffer.from(message) }`
   - معالجة أخطاء محسنة مع إرسال الأخطاء للعميل
   - التحقق من بيانات الاعتماد عند بدء التشغيل

3. **تحسينات واجهة المستخدم | UI/UX Improvements**
   - إضافة زر إلغاء في واجهة التسجيل
   - رسائل خطأ واضحة بالعربية
   - تحسين معالجة حالات الأخطاء (عدم توفر الميكروفون)

4. **الاختبار الشامل | Comprehensive Testing**
   - اختبار كامل عبر Playwright نجح بنسبة 100%
   - التحقق من جميع المراحل: CTA → Consent → Survey → Recording → Done
   - معالجة صحيحة لحالات الأخطاء

---

## البنية المعمارية للنظام | System Architecture

### البنية الأمامية | Frontend Architecture

**الإطار | Framework**: React with TypeScript, using Vite

**نظام مكونات الواجهة | UI Component System**: 
- Shadcn UI components (New York style) built on Radix UI
- TailwindCSS with complete RTL (right-to-left) support
- Custom Arabic-first design system (Cairo, IBM Plex Sans Arabic fonts)
- Component aliases: @/components, @/lib, @/hooks

**إدارة الحالة | State Management**:
- React Hook Form + Zod validation for forms
- TanStack Query for server state
- Local component state for UI phases

**مبادئ التصميم | Design Principles**:
- نظام RTL كامل في جميع أنحاء التطبيق
- لغة بصرية تعطي الأولوية للخصوصية
- جماليات هادئة وموثوقة
- إمكانية الوصول مع ARIA labels صحيحة

### البنية الخلفية | Backend Architecture

**إطار الخادم | Server Framework**: Express.js on Node.js

**الاتصال في الوقت الفعلي | Real-time Communication**: 
- WebSocket implementation using 'ws' library
- Dedicated endpoint at `/ws` for audio streaming
- Bi-directional communication with Google Speech API

**تصميم API | API Design**:
- `POST /api/sessions/init` - Create new session
- `GET /api/sessions/:id` - Get session details
- WebSocket `/ws?sessionId=<id>` - Real-time audio streaming

**تدفق معالجة الصوت | Audio Processing Flow**:
1. Client establishes WebSocket after consent/survey
2. Browser captures audio via AudioWorklet (or ScriptProcessor fallback)
3. Audio downsampled to 16kHz LINEAR16 PCM
4. Chunks streamed to backend over WebSocket
5. Backend forwards to Google Speech-to-Text with proper framing
6. Transcription results sent back to client in real-time
7. Final transcript saved to PostgreSQL database
8. Auto-complete after 20 seconds of silence

**استراتيجية تخزين البيانات | Data Storage Strategy**: 
- PostgreSQL via Neon serverless + Drizzle ORM
- Single `sessions` table (no audio files stored)
- Schema: participant info, session metadata, transcript, status
- Privacy by design - text only

### الاعتماديات الخارجية | External Dependencies

**Google Cloud Speech-to-Text API** (`@google-cloud/speech`):
- Primary speech recognition service
- LINEAR16 PCM encoding at 16kHz
- Arabic language support (ar-SA, ar-AE, ar-EG)
- Credentials: `GOOGLE_APPLICATION_CREDENTIALS_JSON` env variable
- Critical dependency - app will not start without valid credentials

**قاعدة البيانات | Database**: 
- Neon Postgres via `@neondatabase/serverless`
- Connection: `DATABASE_URL` environment variable
- WebSocket-compatible PostgreSQL client
- Drizzle Kit for schema management

**اعتبارات النشر | Deployment Considerations**:
- Required env vars: `DATABASE_URL`, `GOOGLE_APPLICATION_CREDENTIALS_JSON`
- Build: Vite for frontend, esbuild for backend
- Production: compiled code from `dist/` directory
- Static assets from `dist/public`

---

## مراحل التطبيق | Application Phases

التطبيق يتكون من 5 مراحل متسلسلة:

### 1. CTA (Call-to-Action)
- الصفحة الترحيبية
- شرح موجز للخدمة
- زر "ابدأ المشاركة الآن"

### 2. Consent (الموافقة)
- 5 نقاط إفصاح واضحة:
  1. تحويل الجلسة إلى نص للبحث وتحسين الخدمة
  2. عدم حفظ أي تسجيل صوتي
  3. المشاركة اختيارية
  4. حماية البيانات وفق سياسات الخصوصية
  5. إمكانية الإيقاف في أي وقت
- حقل اسم اختياري
- مربع موافقة إلزامي

### 3. Survey (الاستبيان)
- تاريخ الجلسة
- عدد الأطراف (1-10)
- نوع العلاقة (زوجان، أقارب، والد وابنه، أخرى)
- وجود أطفال متأثرين (checkbox)

### 4. Recording (التسجيل)
- خلفية سوداء كاملة
- أيقونة ميكروفون نابضة
- حالة التسجيل: "يتم الآن الاستماع (لا يتم حفظ الصوت)"
- زر إلغاء متاح
- إنهاء تلقائي بعد 20 ثانية صمت

### 5. Done (الاكتمال)
- رسالة شكر
- أيقونة علامة صح
- إعادة تعيين تلقائية بعد 5 ثوانٍ

---

## الملفات الرئيسية | Key Files

### Frontend
- `client/src/pages/home.tsx` - المكون الرئيسي لجميع المراحل
- `client/public/audio-processor.js` - AudioWorklet لمعالجة الصوت
- `client/src/lib/queryClient.ts` - إعداد TanStack Query

### Backend
- `server/routes.ts` - API endpoints + WebSocket handler
- `server/storage.ts` - Database operations interface
- `server/db.ts` - Drizzle ORM configuration

### Shared
- `shared/schema.ts` - Drizzle schema + Zod validation schemas

### Design
- `design_guidelines.md` - دليل التصميم الكامل
- `tailwind.config.ts` - Tailwind configuration with RTL
- `client/index.html` - Arabic fonts (Cairo, IBM Plex Sans Arabic)

---

## المتغيرات البيئية المطلوبة | Required Environment Variables

```bash
DATABASE_URL=<Neon PostgreSQL connection string>
GOOGLE_APPLICATION_CREDENTIALS_JSON=<Google Cloud Service Account JSON>
SESSION_SECRET=<Random secret for session management>
```

---

## تشغيل التطبيق | Running the Application

```bash
# Development
npm run dev

# Build
npm run build

# Production
npm start
```

---

## الخصوصية والأمان | Privacy & Security

### ✅ Privacy Features
- **No audio files stored** - only text transcripts
- Clear consent flow with full disclosure
- User can cancel recording anytime
- Automatic session completion after silence

### ✅ Security Measures
- Google Cloud credentials stored in Replit Secrets
- Database credentials in environment variables
- No client-side storage of sensitive data
- Server-side validation of all inputs

---

## الاختبار | Testing

تم اختبار التطبيق بالكامل باستخدام Playwright:
- ✅ جميع المراحل (CTA → Consent → Survey → Recording → Done)
- ✅ التحقق من صحة النماذج
- ✅ معالجة الأخطاء (عدم توفر الميكروفون)
- ✅ واجهة عربية RTL
- ✅ زر الإلغاء في واجهة التسجيل

---

## التحسينات المستقبلية | Future Enhancements

1. **Operational Logging**
   - Production-grade logging for recognition errors
   - WebSocket lifecycle metrics
   - Performance monitoring

2. **Multi-Device Testing**
   - Real-device smoke tests
   - AudioWorklet fallback validation
   - Cross-browser compatibility tests

3. **Database Management**
   - Migration scripts for production
   - Backup and restore procedures
   - Environment promotion strategy

---

## User Preferences

Preferred communication style: Simple, everyday language (non-technical).

---

**Created**: October 2025  
**Last Updated**: October 29, 2025  
**Status**: ✅ Production Ready
