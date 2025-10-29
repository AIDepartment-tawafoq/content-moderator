# Design Guidelines - Arabic Session Recording Platform

## Design Approach

**Selected Approach:** Custom Design System with Arabic-First Philosophy
**Justification:** This privacy-sensitive application requires a trustworthy, calm aesthetic that respects Arabic design conventions and cultural expectations. The design must balance professional authority with emotional warmth to encourage vulnerable sharing.

**Core Principles:**
- Trust through simplicity and clarity
- Calm, non-intrusive visual language
- Arabic typography excellence
- Progressive disclosure of information
- Privacy signals throughout the experience

---

## Typography System

### Arabic Font Families
- **Primary (Body & UI):** "IBM Plex Sans Arabic" or "Cairo" - clean, highly legible for extended reading
- **Display (Headlines):** "Noto Kufi Arabic" or "Tajawal" - strong presence for key messages
- **Monospace (Technical):** "Inconsolata" for timestamps/IDs if needed

### Type Scale (RTL-optimized)
- **Hero Heading:** text-3xl md:text-4xl font-bold (primary message)
- **Section Heading:** text-xl md:text-2xl font-semibold
- **Body Large:** text-base md:text-lg (consent text, descriptions)
- **Body:** text-sm md:text-base (form labels, secondary content)
- **Caption:** text-xs md:text-sm (help text, disclaimers)

### Hierarchy Rules
- Right-align all Arabic text with consistent padding-right
- Increase line-height for Arabic (leading-relaxed to leading-loose)
- Generous letter-spacing for display text (tracking-wide)
- Use font-weight strategically: 400 (regular), 600 (semibold), 700 (bold)

---

## Layout System

### RTL Foundation
- All layouts use `dir="rtl"` on root containers
- Flex/grid items flow right-to-left
- Padding/margin: use logical properties (ps-, pe-, ms-, me-)
- Icons and buttons: mirror horizontal positioning

### Spacing Primitives
**Core Set:** Use Tailwind units of 2, 4, 6, 8, 12, 16, 20
- **Micro spacing:** gap-2, space-y-2 (form elements, list items)
- **Component spacing:** p-6 md:p-8, gap-4 (cards, sections)
- **Macro spacing:** py-12 md:py-20, mb-16 (page sections)

### Container Strategy
- **Form Cards:** max-w-lg (448px) for focused, intimate interactions
- **Content Width:** max-w-2xl for readable text blocks
- **Centered Layouts:** mx-auto with px-4 md:px-6 for mobile safety

### Multi-Step Flow Layout
Each phase occupies centered card with consistent dimensions:
- **Card Container:** w-full max-w-lg with rounded-2xl
- **Internal Padding:** p-6 md:p-8 xl:p-10
- **Vertical Rhythm:** space-y-4 for form groups, space-y-6 between sections

---

## Component Library

### Primary Card Component
- **Structure:** Rounded corners (rounded-2xl), elevated shadow (shadow-xl)
- **Padding:** Generous internal spacing (p-8)
- **Background:** Clean surface treatment
- **Transitions:** opacity and transform for phase changes (duration-700)

### Button System
- **Primary Action:** Full rounded (rounded-xl), medium padding (px-6 py-3), bold text (font-semibold)
- **Secondary Action:** Outlined style (border-2), matching padding
- **Disabled State:** opacity-40 with cursor-not-allowed
- **Button Group:** flex gap-3 justify-end for action pairs

### Form Elements
- **Text Inputs:** Full width (w-full), rounded (rounded-lg), visible border, padding (px-4 py-3)
- **Select Dropdowns:** Match input styling with caret on right (RTL)
- **Checkboxes:** Larger touch target (w-5 h-5), positioned right of label
- **Labels:** Block display (block), small text (text-sm), spacing (mb-2)

### Consent & Privacy Components
- **Consent Text Block:** 
  - Bulleted list with right-aligned bullets (list-disc pr-5)
  - Comfortable line spacing (space-y-2)
  - Readable text size (text-sm md:text-base)
  - Contained in bordered section (border rounded-lg p-4)

- **Checkbox Agreement:**
  - Prominent checkbox with label combination
  - Flex row with gap-2, items-center
  - Text wrapping for long consent statements

### Recording Interface
- **Dimmed Overlay:** Full-screen transition to near-black backdrop (bg-black/95)
- **Status Indicator:** Fixed bottom positioning (bottom-8), centered text, subtle presence
- **Visual Feedback:** Pulsing animation for active recording state (animate-pulse)

### Multi-Phase Transition System
- **Phase Switching:** Smooth opacity transitions (transition-opacity duration-700)
- **Background Transitions:** Color shifts for recording phase (transition-colors duration-700)
- **Card Animations:** Subtle scale on mount (scale-95 to scale-100)

---

## User Flow Components

### Phase 1: Call-to-Action Card
- **Headline:** Prominent, emotionally warm (text-2xl font-bold mb-2)
- **Subtext:** Reassuring privacy message (text-gray-600 mb-6)
- **CTA Button:** Single, clear action (large, centered)
- **Visual Treatment:** Clean card on subtle background

### Phase 2: Consent Interface
- **Header:** Clear section title (text-xl font-semibold mb-4)
- **Consent Points:** Structured list, easy scanning
- **Optional Name Field:** Low-pressure optional input
- **Checkbox Confirmation:** Required, clear visual state
- **Navigation:** Two-button group (back + proceed)

### Phase 3: Survey Form
- **Form Layout:** Vertical stack with clear labels
- **Input Variety:** Number inputs, selects, checkboxes
- **Field Grouping:** Each question isolated with spacing
- **Helper Text:** Contextual information for complex questions

### Phase 4: Recording State
- **Minimal Interface:** Near-blank screen, no distractions
- **Subtle Status:** Bottom-centered, small text
- **No Interruptions:** Clean, meditation-like environment
- **Auto-Exit:** Graceful transition when silence detected

### Phase 5: Completion
- **Thank You Message:** Gratitude expression (text-green-100)
- **Auto-Reset:** Returns to initial state for next user
- **Confirmation:** Brief success indicator before reset

---

## Accessibility & Arabic Excellence

### RTL Optimization
- Consistent right-alignment for all Arabic text
- Mirrored directional icons (arrows, chevrons)
- Form field labels positioned right of inputs
- Progress indicators flow right-to-left

### Touch & Interaction
- Minimum touch targets: 44x44px (h-11 min-w-[44px])
- Generous spacing between interactive elements (gap-4)
- Clear focus states for keyboard navigation
- High contrast between text and backgrounds

### Privacy Signals
- Explicit "no recording saved" messaging throughout
- Lock/shield iconography where appropriate
- Trusted authority visual cues (certificates, seals)
- Transparent process indicators

---

## Images

**Hero Section:** Not applicable - this is a utility-focused application prioritizing trust and simplicity over visual marketing.

**Icon Usage:** 
- Use Font Awesome or Heroicons via CDN
- Key icons: microphone, shield/lock (privacy), checkmark (confirmation), arrow-left (back button in RTL)
- Icon sizing: w-5 h-5 for inline, w-6 h-6 for prominent features
- Placement: Right of text in RTL layout

**Decorative Elements:**
- Subtle geometric patterns in card backgrounds (optional low-opacity overlays)
- Privacy-themed illustrations only if they enhance trust (keep minimal)

---

## Animation Philosophy

**Minimal, Purposeful Motion:**
- Fade transitions between phases (opacity changes)
- Smooth color transitions for recording state
- Pulse effect for active recording indicator (subtle, slow)
- No unnecessary animations that distract from privacy-focused purpose

**Timing:** 
- Page transitions: duration-700
- Micro-interactions: duration-300
- Recording pulse: duration-1000 (slow, calm)