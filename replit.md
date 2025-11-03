# منصة تسجيل جلسات المصالحة العربية
# Arabic Session Recording Platform

## Overview
An Arabic-first, privacy-focused web application for recording and transcribing counseling/mediation sessions. The platform is designed for counselors to initiate sessions, record with real-time speech-to-text conversion, and then complete an evaluation survey. Crucially, no audio files are stored; only the transcribed text is saved for service improvement. The application emphasizes trust, privacy, and cultural sensitivity with a calm, professional design tailored for Arabic-speaking counselors. Key capabilities include a secure admin panel for session viewing and export, enhanced audio processing, and robust integration with Google Speech-to-Text for high-quality Arabic transcription. The user flow is streamlined: Call-to-Action -> Recording -> Survey -> Done.

## User Preferences
Preferred communication style: Simple, everyday language (non-technical).

## System Architecture

### Frontend Architecture
The frontend is built with React and TypeScript using Vite. It utilizes Shadcn UI components (New York style) based on Radix UI, styled with TailwindCSS and full RTL support. A custom Arabic-first design system incorporates Cairo and IBM Plex Sans Arabic fonts. State management uses React Hook Form with Zod for validation, and TanStack Query for server state. Design principles prioritize a full RTL system, privacy-focused visual language, calm aesthetics, and accessibility with correct ARIA labels.

### Backend Architecture
The backend is an Express.js application on Node.js. Real-time communication is handled via WebSockets using the `ws` library, specifically for audio streaming. The API design includes endpoints for session initialization and retrieval. The audio processing flow involves client-side audio capture and downsampling to 16kHz LINEAR16 PCM, streaming to the backend via WebSocket, forwarding to Google Speech-to-Text, and real-time transcription results sent back to the client. The final transcript is saved to a PostgreSQL database.

### Data Storage Strategy
PostgreSQL, managed by Neon serverless, is used with Drizzle ORM. A single `sessions` table stores participant information, session metadata, transcripts, and status, with no audio files ever being stored, adhering to a "privacy by design" principle.

### UI/UX Decisions
The application features a dark, calming aesthetic during recording, using new brand colors: Primary Orange (#E88F3A) and Secondary Turquoise (#1B9AAA). Arabic fonts (Cairo, IBM Plex Sans Arabic) are used throughout for an authentic Arabic-first experience. The user flow is structured into CTA, Recording, Survey (for counselors), and Done phases. The admin panel provides a secure, organized table view for sessions with CSV export.

### Feature Specifications
- **Real-time Transcription**: Converts spoken Arabic to text using Google Speech-to-Text.
- **Privacy-focused**: No audio files are ever stored, only transcribed text.
- **Counselor-centric Workflow**: Designed for counselors to manage sessions and evaluations.
- **Admin Panel**: Secure access to view and export session data.
- **Survey Integration**: Post-session survey for counselors to evaluate session effectiveness, reconciliation progress, and add notes.
- **Audio Processing**: Enhanced client-side audio processing via AudioWorklet, with fallback for older browsers, downsampling to 16kHz LINEAR16 PCM.
- **RTL Support**: Full right-to-left language support for the Arabic interface.
- **Pause/Resume Recording**: Functionality to temporarily halt and restart recording.
- **Auto-completion**: Sessions automatically end after 5 minutes of silence.
- **Long Session Support**: Automatic stream restart every 4.5 minutes to handle Google's ~5-minute streaming limit. Supports sessions of 1-2 hours or longer without data loss.

## External Dependencies

-   **Google Cloud Speech-to-Text API** (`@google-cloud/speech`): Primary speech recognition service for Arabic (ar-SA, ar-AE, ar-EG) using LINEAR16 PCM encoding at 16kHz. Requires `GOOGLE_APPLICATION_CREDENTIALS_JSON` environment variable.
-   **Neon Postgres**: Serverless PostgreSQL database accessed via `@neondatabase/serverless` and managed with Drizzle Kit for schema. Requires `DATABASE_URL` environment variable.