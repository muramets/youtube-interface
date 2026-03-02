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
