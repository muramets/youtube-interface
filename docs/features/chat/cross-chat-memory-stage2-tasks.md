# Cross-Chat Memory Stage 2 — Task Doc

## Quick Context Recovery

1. **This file** — execution plan, phases, key decisions
2. `docs/features/chat/memory-system.md` — feature doc (Stage 2 roadmap, L4 architecture)
3. `functions/src/services/memory.ts:346-368` — `CONCLUDE_SYSTEM_PROMPT` (prompt to update)
4. `src/features/Settings/components/AiAssistantSettings.tsx` — Settings UI (add "Add Memory" button)
5. `src/core/services/ai/chatService.ts:43-44` — `memoriesPath`, existing CRUD operations
6. `src/core/types/chat/chat.ts:104-113` — `ConversationMemory` interface

## Key Decisions (carry forward)

1. **Markdown storage, not JSON fields.** `content: string` stays as-is. Consistent sections achieved via prompt, not `responseSchema` changes. Rationale: markdown is easier to display, edit, and inject into system prompt. AI reads narrative better than JSON categories. `responseSchema` stays `{ content, referencedVideoIds }`.

2. **Section headers via prompt, not schema.** `CONCLUDE_SYSTEM_PROMPT` specifies exact headers: `## Decisions`, `## Insights`, `## Channel State`, `## Action Items`, `## Open Questions`. LLM omits empty sections. No code changes needed to parse or render — markdown rendering handles it.

3. **Manual memories = same collection, different source.** Saved to `conversationMemories` with `source: 'manual'` instead of `conversationId`. No video refs, no LLM processing. User writes markdown directly.

4. **Scaffolding is optional.** "Add Memory" textarea pre-fills section headers as placeholder/template. User can use them or delete and write free-form. Not enforced.

5. **`conversationId` becomes optional.** Currently required on `ConversationMemory`. Manual memories have no conversation — field should be `conversationId?: string`. Existing memories unaffected (all have it populated).

## Agent Orchestration Strategy

Main context = executor + orchestrator. Feature is small (2 phases) — no subagent parallelization needed.

## Phase Status

| Phase | Goal | Status |
|-------|------|--------|
| P1 | Backend: consistent sections prompt | DONE |
| P2 | Frontend: manual memory creation | DONE |
| FINAL | npm run check + tests + review | DONE |

## Current Test Count

**1061 tests** (663 frontend + 398 backend, 71 files) — verified `2026-03-07`.

---

## P1 — Consistent Memory Sections (Prompt Update)

**Goal:** Every new L4 memory generated via "Memorize" has consistent section headers.

### Critical Context

- `CONCLUDE_SYSTEM_PROMPT` is at `functions/src/services/memory.ts:346-368`
- Current prompt says: "bullet points grouped by topic, 100-300 words"
- `responseSchema` stays unchanged: `{ content: STRING, referencedVideoIds: ARRAY<STRING> }`
- Existing tests in `functions/src/services/__tests__/memory.test.ts` — `generateConcludeSummary` is mocked in most tests. Check if any test asserts on `CONCLUDE_SYSTEM_PROMPT` content.

### Tasks

- [x] **T1.1** `functions/src/services/memory.ts` — update `CONCLUDE_SYSTEM_PROMPT`
  - Replace "bullet points grouped by topic" instruction with explicit section headers:
    ```
    Structure the content with these exact markdown headers (omit sections with no content):
    ## Decisions — what was chosen and why
    ## Insights — patterns observed, lessons learned, what works or doesn't
    ## Channel State — snapshot of current channel metrics and situation
    ## Action Items — anything planned but not yet done
    ## Open Questions — unresolved issues for future exploration
    ```
  - Keep existing instructions: 100-300 words, same language, no chitchat, use exact video titles
  - Keep JSON output format instruction (`content` + `referencedVideoIds`)

- [x] **T1.2** `functions/src/services/__tests__/memory.test.ts` — add/update test
  - Test that `generateConcludeSummary` passes the updated system prompt to Gemini (if prompt content is asserted)
  - If no existing test asserts prompt content — add one that verifies key section headers are present in the system instruction

### Verification

```bash
npx vitest run --project functions src/services/__tests__/memory.test.ts
```

### MANDATORY: Update this file before proceeding
- [x] Mark tasks complete
- [x] Update phase status table
- [x] Record test count delta

---

## P2 — Manual Memory Creation (Frontend + Service)

**Goal:** User can create a memory from Settings > AI Memory without having a chat conversation.

### Critical Context

- `AiAssistantSettings.tsx` already has: memory list, edit (inline textarea), delete
- `chatService.ts:354-367` has `updateMemory` and `deleteMemory` — need to add `createMemory`
- `memoriesPath` = `users/${userId}/channels/${channelId}/conversationMemories`
- `ConversationMemory` interface: `{ id, conversationId, conversationTitle, content, guidance?, videoRefs?, createdAt, updatedAt }`
- `settingsSlice.ts:62-69` exposes `updateMemory` and `deleteMemory` on store — need to add `createMemory`
- Firestore `addDocument` or `doc().set()` — check existing patterns in `chatService.ts`
- Memory scaffolding template (section headers) — define as constant, reuse in textarea placeholder

### Tasks

- [x] **T2.1** `src/core/types/chat/chat.ts` — make `conversationId` optional
  - Change `conversationId: string` to `conversationId?: string` on `ConversationMemory`
  - Add optional `source?: 'chat' | 'manual'` field
  - Verify no code assumes `conversationId` is always present (grep for `.conversationId` usage)

- [x] **T2.2** `src/core/services/ai/chatService.ts` — add `createMemory` method
  - Add to `ChatService` object:
    ```ts
    async createMemory(userId: string, channelId: string, content: string): Promise<string>
    ```
  - Creates doc in `memoriesPath(userId, channelId)` with:
    - `content` — user-provided markdown
    - `conversationTitle` — "Manual note" (or similar English label)
    - `source` — `'manual'`
    - `videoRefs` — `[]`
    - `createdAt` / `updatedAt` — `serverTimestamp()`
  - Returns the new doc ID
  - Check existing `addDocument` helper or use Firestore `addDoc` directly — match existing patterns

- [x] **T2.3** `src/core/stores/chat/slices/settingsSlice.ts` — expose `createMemory` on store
  - Add `createMemory: (content: string) => Promise<void>` to slice type and implementation
  - Pattern: same as `updateMemory` — gets `userId`/`channelId` from `getContext()`, calls `ChatService.createMemory`
  - Update `src/core/stores/chat/types.ts` — add to `ChatState` interface

- [x] **T2.4** `src/features/Settings/components/AiAssistantSettings.tsx` — "Add Memory" UI
  - Add "Add Memory" button in the AI Memory section header (next to the section title)
  - On click: show inline textarea (similar to edit mode) with scaffolding placeholder:
    ```
    ## Decisions\n\n## Insights\n\n## Channel State\n\n## Action Items
    ```
  - Placeholder text (grey) — not pre-filled content. User types from scratch, sees headers as guide.
  - Save button calls `createMemory(content)`. Cancel button hides textarea.
  - After save: textarea hides, new memory appears in list (Firestore subscription auto-updates)
  - State: `isCreating: boolean`, `newMemoryText: string`
  - Button label: "Add Memory". Save/Cancel: reuse existing icon pattern (Check/X from lucide)

- [x] **T2.5** Tests
  - `src/core/services/ai/__tests__/chatService.test.ts` — test `createMemory` (if test file exists; if not, add to relevant test file):
    - Creates doc with correct fields (`source: 'manual'`, empty `videoRefs`, serverTimestamp)
    - Correct Firestore path
  - `src/features/Settings/__tests__/AiAssistantSettings.test.tsx` — test "Add Memory" flow (if test file exists):
    - Button renders
    - Click opens textarea with placeholder
    - Save calls `createMemory`
    - Cancel hides textarea

### Verification

```bash
npm run check
npm run test:run
```

### MANDATORY: Update this file before proceeding
- [x] Mark tasks complete
- [x] Update phase status table
- [x] Record test count delta

---

## FINAL — Verification + Double Review + Docs

### Verification

```bash
npm run check
npm run test:run
npx vitest run --project functions
```

### R1 — Architecture Review (subagent)

**Prompt for review agent:**

> Read these files in order:
> 1. `docs/features/chat/cross-chat-memory-stage2-tasks.md` (Key Decisions)
> 2. `functions/src/services/memory.ts` (CONCLUDE_SYSTEM_PROMPT)
> 3. `src/core/types/chat/chat.ts` (ConversationMemory interface)
> 4. `src/core/services/ai/chatService.ts` (createMemory)
> 5. `src/core/stores/chat/slices/settingsSlice.ts` (createMemory on store)
> 6. `src/features/Settings/components/AiAssistantSettings.tsx` (Add Memory UI)
> 7. `src/core/ai/layers/crossConversationLayer.ts` (injection — handles manual memories?)
>
> Answer these questions:
> 1. Does `CONCLUDE_SYSTEM_PROMPT` contain all 5 section headers with "omit empty sections" instruction?
> 2. Is `ConversationMemory.conversationId` optional? Does any code assume it's always present?
> 3. Does `createMemory` save with `source: 'manual'`, empty `videoRefs[]`, correct timestamps?
> 4. Does `crossConversationLayer` handle memories without `conversationId` (no crash, sensible title)?
> 5. Is there any state management leak (isCreating state cleanup on unmount, etc.)?
> 6. Are the new store methods typed correctly in `types.ts`?

Fix all findings before proceeding to R2.

### R2 — Production Readiness Review (subagent)

**Prompt for review agent:**

> Read the same files as R1. Answer:
> 1. Can a user save an empty memory (blank content)? Should we validate?
> 2. Does the Firestore write in `createMemory` handle errors (try/catch, user feedback)?
> 3. Are there missing test cases? (edge cases: empty content, very long content, special characters in markdown)
> 4. Does the "Add Memory" UI gracefully handle save failure (network error)?
> 5. Is the scaffolding placeholder text in English (per design system rule: all user-facing text in English)?
> 6. Do existing memories (with `conversationId`, without `source` field) still work correctly?

Fix all findings before proceeding to docs update.

### Docs Update

- [x] `docs/features/chat/memory-system.md` — update "Текущее состояние" (add Stage 2 capabilities)
- [x] `docs/features/chat/memory-system.md` — move `← YOU ARE HERE` marker past Stage 2
- [x] `docs/features/chat/memory-system.md` — update Technical Implementation section:
  - `CONCLUDE_SYSTEM_PROMPT` — note consistent section headers
  - `chatService.createMemory` — new method
  - `ConversationMemory.source` — new optional field
- [x] `docs/features/chat/memory-system.md` — update Firestore Schema (add `source` field to memory doc)
- [x] This task doc — mark all phases DONE, record final test count

### MANDATORY: Update this file
- [x] All phases DONE
- [x] Final test count recorded (run actual tests, not from memory)
- [x] All docs updated per checklist above
