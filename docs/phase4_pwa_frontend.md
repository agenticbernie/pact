# PHASE 4 — PWA FRONTEND CORE

Implements `docs/pact_docs.md` §3.3.1, §4 (UI/UX Design Principles & Mobile-First PWA Guidelines), FR-04, FR-05, and NFR-01.

---

## 1. Architecture & Components

The frontend client in `/web` is built using **Next.js 14 App Router**, **Tailwind CSS**, and **`@zxing/browser`**:

| Component | Path | Responsibility |
|---|---|---|
| **PWA App Entry & Manifest** | `web/src/app/layout.tsx`, `web/public/manifest.json` | Mobile-first viewport settings, PWA icons, status bar colors (`#E84142` theme). |
| **Payer Camera Scanner** | `web/src/components/QrScanner.tsx` | Real-time 60 FPS viewport scanning with `@zxing/browser`, torch/flashlight toggle, centered reticle, and validation against Pact JSON schema. |
| **Route Selector Modal** | `web/src/components/RouteSelectorModal.tsx` | Dynamic bottom sheet in natural thumb zone (bottom 40%). Live comparison of **⚡ Lightning** (~2.0s) vs **🐢 Economy** (~15-45s) routes with **Slide-to-Pay** confirmation. |
| **Merchant POS Terminal** | `web/src/components/MerchantTerminal.tsx` | Touch keypad for instant invoice total entry, toggle between Arbitrum Sepolia (`421614`) and Base Sepolia (`84532`), dynamic QR generation (`qrcode.react`), and audio/haptic settlement transitions. |
| **Multisensory Feedback** | `web/src/lib/feedback.ts` | Iconic Web Audio API "Ting Ting" dual chime (C6/E6 tones) and `navigator.vibrate([40, 60, 40])` haptic pulses. |

---

## 2. Design System Alignment (§4.2)

- **Colors:**
  - Brand Accent: `#E84142` (Avalanche Flame Red)
  - Semantic Success: `#10B981` (MoMo Emerald)
  - Surface Backgrounds: `#0F172A` (Slate 900) & `#1E293B` (Slate 800)
- **Zero Blockchain Jargon (§4.1):**
  - Amounts displayed cleanly in `$ USD`.
  - No confusing hex gas fees, gwei, or complex nonce dialogues.

---

## 3. Verification

- Next.js production build succeeded (`npm --workspace=web run build`).
- TypeScript typecheck passing across all workspaces (`npm run typecheck`).
