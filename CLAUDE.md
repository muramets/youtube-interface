# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### Frontend
```bash
npm run dev          # Start Vite dev server
npm run build        # TypeScript compile + Vite bundle
npm run typecheck    # Type-check without emitting (tsconfig.app.json)
npm run lint         # ESLint
npm run test         # Vitest watch mode
npm run test:run     # Vitest single run```

### Cloud Functions (in `functions/`)
```bash
npm run build        # Compile TypeScript
npm run serve        # Start Firebase emulator locally
npm run deploy       # Deploy functions to Firebase
npm run logs         # Stream function logs
```

## Architecture

### Overview
A YouTube creator management SaaS — video editing, packaging, trends analysis, AI chat, playlist management, and a server-side video render pipeline.

### Frontend Stack
- **React 19** with React Router v7 (file-based routing via `src/pages/`)
- **Zustand** for state (domain-sliced stores in `src/core/stores/`)
- **TanStack Query** for server state / data fetching
- **Tailwind CSS** (custom CSS variables for theming, z-index scale)
- **Framer Motion** for animations
- **@dnd-kit** for drag-and-drop (sortable lists)
- **Tiptap** for rich-text editing
- **Vitest + React Testing Library** for tests

### Backend Stack
- **Firebase**: Auth, Firestore, Storage, Cloud Functions (Node 24)
- **Google Generative AI (Gemini)** for AI chat and analysis
- **Cloudflare R2** for large file storage (renders, audio)
- **Google Cloud Tasks** + **Cloud Run** for async render jobs
- **ffmpeg** on Cloud Run for video encoding

### Directory Layout
```
src/
  components/        # Reusable components
    ui/atoms/        # Button, Badge, Checkbox, Toggle, SplitButton
    ui/molecules/    # Toast, DropZone
    Layout/          # Header, Sidebar
  core/
    hooks/           # Data-access hooks (useAuth, useChannels, useVideos…)
    services/        # Firestore / API logic (channelService, videoService…)
    stores/          # Zustand stores (channel, filter, ui, editing, canvas, trends)
    types/           # Shared TypeScript interfaces
    ai/              # Gemini AI integration layers
  features/          # Self-contained feature modules
    Canvas/          # Node-based visual editor (graphs, geometry, toolbar)
    Chat/            # AI chat UI
    Video/           # Video management modals and hooks
    Render/          # Render queue FAB
    Playlists/       # Playlist management
  pages/             # Route-level page components
    Home/
    Details/         # Video detail: tabs for Editing, Packaging, Gallery, Traffic, TrafficSource
    Trends/
    Music/
    Playlists/
  shared/            # Shared models, db helpers, auth (also consumed by functions)

functions/src/
  chat/              # AI chat Cloud Functions (Gemini)
  render/            # startRender, cancelRender, deleteRender
  trends/            # scheduledSync, manualSync
  audio/             # trimAudioFile
  triggers/          # Firestore triggers (onProjectDeleted, onConversationDeleted)
  services/          # Gemini, YouTube, R2, sync, memory wrappers
```

### State Management Pattern
- Zustand stores are domain-scoped: `channelStore`, `filterStore`, `uiStore`, `editingStore`, `canvasStore`, `trendsStore`, `notificationStore`
- Canvas store uses a sliced architecture (`src/core/stores/canvas/slices/`)
- Stores use `persist` middleware for localStorage persistence where appropriate
- Components consume state via hooks, not stores directly

### Data Flow
1. **Services** (`src/core/services/`) — raw Firestore/API calls
2. **Custom hooks** (`src/core/hooks/`) — compose services + TanStack Query
3. **Stores** — cache and orchestrate cross-component state
4. **Components/Pages** — consume via hooks and Zustand selectors

### Render Pipeline
```
Browser → Cloud Function (startRender) → Cloud Tasks → Cloud Run Job → ffmpeg → R2 → Firestore status update
```
UI listens for status changes via Firestore `onSnapshot`. Download links come from Cloudflare R2. Full details in `docs/render-pipeline-guide.md`.

### Key Conventions
- ESLint uses flat config (`eslint.config.js`) with TypeScript, React, React Hooks, and React Refresh plugins
- TypeScript strict mode is on
- Vite config splits vendor chunks: firebase, ai, vendor, app (see `vite.config.ts`)
- PWA is configured via `vite-plugin-pwa` with workbox caching and auto-update

## Working Rules

### Language
- Think and reason internally in English.
- All responses to the user must be in Russian with English technical terminology preserved (component names, library names, CLI commands, etc.).

### Before Editing Code
- Always provide a brief, user-friendly overview in Russian before touching any code: what the bug is, why it exists, what changes will be made, and any potential negative side effects.
- **Never commit or push without explicit user instruction. Ever.**
- Required "long term vision" discussion before editing: for a feature — discuss its final state in the market-ready product and how it integrates with existing functionality; for a refactor — discuss how it fits the overall app and where else the data/logic is used.
- The codeword to begin editing the codebase is **"ебашим"**. Do not touch code until this word is received.

### After Editing Code
- Always run `npm run lint` from the project root (not `tsc` directly). Lint includes type-aware checks + hooks rules.
- When creating new files or refactoring imports — additionally run `npm run typecheck`.
- Fix all lint errors and warnings following industry best practices — no hacks or workarounds. If a fix requires an architectural change, make it.

### Communication Style
- The user is a product director / orchestra conductor with no assumed technical background. Always accompany technical explanations with plain, everyday Russian language analogies.
- Present solutions following industry best practices: clean code, separation of concerns, no anti-patterns, clear placement within the project structure.

### Design System
- Always prioritize existing design tokens from `src/components/ui/` and Tailwind config for new features.
- If existing tokens are insufficient, extend the global design system — never hardcode values.
- All new UI must use CSS variables that respond to theme changes.

### Feature Documentation (`docs/features/`)
- Before changing any file in `src/features/` or `src/pages/` — read its doc in `docs/features/`.
- After changes — update "Текущее состояние", move the `← YOU ARE HERE` marker, and update cross-feature links if integrations changed. If another feature is affected, update both docs.
- If no doc exists — create one from the template below and send it for review before proceeding.
- Send the updated doc to the user in chat after every update.
- **Doc template (Russian, compact)**:
  - `current state` — ≤10 lines; business logic in plain language; separate technical details from business logic.
  - `roadmap` — per-stage description of user flow + checklist; final stage = market-ready vision (architecture, cost, storage, API usage).

### Separation of Concerns
- When creating a new hook or component, immediately extract pure logic (calculations, transformations, formatting) into a separate `utils` file.
- Hooks = I/O + orchestration only. Components = presentation only. Pure functions = separate files in `utils/`.
- Never "write everything together and refactor later" — that is an anti-pattern.

### Domain-Driven File Organization
- When new functionality contains 2+ files of the same domain (e.g. definitions + executor + handlers) — immediately place them in a dedicated folder.
- One handler / hook / util = one file. Dispatcher / registry = separate file.
- Every new file must have a single responsibility (SRP). If a file mixes routing and business logic — split immediately, not in a future refactor.
