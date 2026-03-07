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
UI listens for status changes via Firestore `onSnapshot`. Download links come from Cloudflare R2. Full details in `docs/features/render/README.md`.

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
- Always run **`npm run check`** from the project root. This single command runs ESLint + TypeScript compiler + doc link checker. Never skip typecheck — ESLint alone does NOT catch TypeScript compilation errors (e.g. missing destructured variables, type mismatches).
- Fix all lint/type errors and warnings following industry best practices — no hacks or workarounds. If a fix requires an architectural change, make it.
- **Always run existing tests before deploying** (`npm run test:run` for frontend, `npx vitest run --project functions` for backend — both from project root). "Lint/typecheck pass" is NOT a substitute for passing tests. If test runner itself fails (timeout, worker crash, config issue) — fix the test infrastructure first, do not deploy with broken tests.
- When renaming exported types, interfaces, or functions — grep `docs/features/` for the old name manually. `check:docs` (included in `npm run check`) only validates file paths, not symbol names.
- Fix any broken references before finishing.

### Communication Style
- The user is a product director / orchestra conductor with no assumed technical background. Always accompany technical explanations with plain, everyday Russian language analogies.
- Present solutions following industry best practices: clean code, separation of concerns, no anti-patterns, clear placement within the project structure.

### Design System
- Always prioritize existing design tokens from `src/components/ui/` and Tailwind config for new features.
- If existing tokens are insufficient, extend the global design system — never hardcode values.
- All new UI must use CSS variables that respond to theme changes.
- **All user-facing text in the application (labels, buttons, placeholders, tooltips, error messages, empty states) must be in English.** Never use Russian in the UI — it is a product for an international audience.

### Feature Documentation (`docs/features/`)
- **Every feature implementation or change — frontend or backend — must have a doc in `docs/features/`.** This is non-negotiable.
- Before changing any file in `src/features/`, `src/pages/`, or `functions/src/` — read its doc in `docs/features/`.
- If no doc exists — create one from the template below **before writing any code** and send it for review.
- After changes — update "Текущее состояние", move the `← YOU ARE HERE` marker, and update cross-feature links if integrations changed. If another feature is affected, update both docs.
- Send the updated doc to the user in chat after every update.
- **Doc template (Russian, compact)**:
  - `current state` — ≤10 lines; business logic in plain language; separate technical details from business logic.
  - `roadmap` — per-stage description of user flow + checklist; final stage = market-ready vision (architecture, cost, storage, API usage).
- **Doc structure rule: "why" on top, "how" on bottom.** Top sections (`current state`, `what is this`, `user flow`) must describe business behavior in plain language — what the user sees and why the feature exists. Any reference to a specific file name, Firestore collection, function name, API name, or version number belongs in a dedicated `Technical Implementation` section at the bottom. This prevents documentation from going stale when code is refactored — business intent rarely changes, but file paths and collection names change often.

### Agentic Task Documents (`docs/features/*-tasks.md`)

For multi-phase features requiring coordinated agent execution across sessions, create a **task document** alongside the feature doc. The task doc is the orchestration blueprint — optimized for agents that may lose context between sessions.

**Reference implementation:** `docs/features/video-view-deltas-tasks.md` (battle-tested, fully executed).

#### Required sections (in order):

**1. Quick Context Recovery** (top of file)
- Ordered list of 3-5 files to read when context is lost
- Starts with the task doc itself, then feature doc, then key source files
- Agent reads these in order and recovers full context without asking questions

**2. Key Decisions (carry forward)**
- 3-7 critical architectural decisions that MUST survive context loss
- Each: what was decided + why (rejected alternative optional but valuable)
- These are the "if you forget everything else, remember THIS" items

**3. Agent Orchestration Strategy**
- Who is executor (main context) vs subagent (reviews, parallel work)
- Explicit statement: "Main context = executor + orchestrator"

**4. Phase/Wave Status table** — one-line status per phase (TODO / IN PROGRESS / DONE)

**5. Current Test Count** — running total updated after every phase

**6. Per-phase sections** — each phase contains:
- **Goal**: one sentence
- **Critical Context**: gotchas, prerequisites, ⚠️ warnings about traps
- **Tasks** with checkboxes:
  - Exact file paths to create/modify (with line numbers when relevant)
  - Mock targets for tests
  - Edge cases to cover
  - ⚠️ warnings about provider-specific traps
- **Parallelization plan** (ASCII diagram within each phase):
  ```
  T3.1 — SEQUENTIAL FIRST (foundation)
  T3.2 + T3.3 + T3.4 — PARALLEL subagents
  T3.6 — SEQUENTIAL LAST
  ```
- **Verification**: exact shell commands to run
- **MANDATORY: Update this file before proceeding** — checklist: mark tasks, update status table, record test count

**7. Review Gates** — after each phase:
- Full **prompt** for review agent (specific questions, not just a checklist)
- "Fix all findings before moving to next phase"

**8. FINAL phase**: Double review-fix cycle (R1 Architecture + R2 Production Readiness)

#### Separation: Feature Doc vs Task Doc
- **Feature doc** (`feature-name.md`): business goal, user flow, roadmap, current state, technical implementation. Lives forever, updated incrementally.
- **Task doc** (`feature-name-tasks.md`): execution plan, phases, agent assignments, test counts, review gates. Created before implementation, becomes historical reference after completion.
- Feature doc = "what and why". Task doc = "how and in what order".

#### Pattern Promotion Rule
After completing a multi-phase feature, review the task doc for patterns that worked well:
- If a pattern improved agent efficiency or reduced errors → add it to this CLAUDE.md section
- If a pattern caused confusion or was ignored by agents → remove or rephrase it
- Update the reference implementation pointer if the new doc is better than the current reference
- This is how the agentic workflow improves over time: each completed feature teaches the next one

### Backlog Management (`docs/backlog.md`)
- `docs/backlog.md` — index (таблица ссылок на feature docs). Не дублировать детали.
- Детали backlog items живут в feature docs (`docs/features/`). Cross-feature items — в `docs/backlog/`.
- Добавление: сначала деталь в feature doc → потом строка в index.
- Завершение: отметить `[x]` в feature doc → удалить строку из index → добавить в `docs/backlog/archive.md`.
- Done items хранятся в `docs/backlog/archive.md` (одна строка на item).

### Separation of Concerns
- When creating a new hook or component, immediately extract pure logic (calculations, transformations, formatting) into a separate `utils` file.
- Hooks = I/O + orchestration only. Components = presentation only. Pure functions = separate files in `utils/`.
- Never "write everything together and refactor later" — that is an anti-pattern.

### Domain-Driven File Organization
- When new functionality contains 2+ files of the same domain (e.g. definitions + executor + handlers) — immediately place them in a dedicated folder.
- One handler / hook / util = one file. Dispatcher / registry = separate file.
- Every new file must have a single responsibility (SRP). If a file mixes routing and business logic — split immediately, not in a future refactor.

### Effort Estimation
When estimating task duration, account for **agentic development speed**, not human-developer baselines:
- **Boilerplate & repetitive edits** (import updates, file moves, config generation): minutes, not hours. Agents parallelize and don't fatigue.
- **Knowledge formalization** (writing docs, CLAUDE.md sections, PATTERNS.md): fast — the agent already holds codebase context in memory.
- **Pattern application** (applying an existing project pattern to a new feature): fast — no learning curve.
- **Product decisions** (Free vs Pro tier, UX flow, naming): bottleneck is human, not agent. Flag these as "awaiting user input" rather than padding the estimate.
- **External service setup** (GitHub secrets, Sentry account, DNS): bottleneck is human clicking through UIs. Estimate the agent's part separately.
- **Browser testing & visual QA**: slower — requires human eyes or multi-step browser automation.
- **Novel architecture** (designing a pattern that doesn't exist in the codebase yet): comparable to human speed — requires reasoning, not just execution.

Rule of thumb: for tasks that are mostly code generation + refactoring, divide the human-baseline estimate by 3–5x. For tasks requiring product decisions or external service interaction, estimate the human part separately.

### Elite Senior Dev Lens (New Feature Design)
Before implementing any new feature or extending existing functionality, challenge every design decision by asking:
1. **Deterministic vs magic.** Is the API contract explicit and predictable, or does it rely on the caller (LLM or human) guessing the right value? Prefer enums and structured options over free-form numeric parameters.
2. **Computation vs interpretation.** Code does math (precise, deterministic). LLMs do pattern recognition and explanation. Never make an LLM compute deltas, percentages, or arithmetic — pre-compute and pass as structured data. Give raw data for pattern recognition AND pre-computed results for citation.
3. **Data trajectory.** When temporal data exists (snapshots, versions, history), never reduce it to "latest + one delta". Preserve the full timeline so the consumer sees the shape of change over time, not just the last step. Each data point in a timeline should include its delta from the previous point (pre-computed by code, not the consumer).
