# Memory Video References — Task Doc

## Quick Context Recovery

1. **This file** — execution plan, phases, key decisions
2. `docs/features/chat/memory-system.md` — feature doc (L4 section, roadmap Stage 1.5)
3. `functions/src/services/memory.ts` — `generateConcludeSummary`, `CONCLUDE_SYSTEM_PROMPT`
4. `functions/src/chat/concludeConversation.ts` — Cloud Function, saves memory to Firestore
5. `src/core/types/chat/chat.ts:101` — `ConversationMemory` interface

## Key Decisions (carry forward)

1. **Candidates from code, selection by LLM.** Code deterministically extracts all videos from `appContext` + `toolCalls`. LLM chooses which of those are relevant to the insight. LLM never invents IDs — picks from a finite list.

2. **Structured output (JSON).** `generateConcludeSummary` returns `{ content, referencedVideoIds }` via Gemini JSON mode. Not free-form text parsing.

3. **Snapshot storage.** `videoRefs` stores `{ videoId, title, ownership, thumbnailUrl }` at memorize time. No live lookups — data survives video deletion/rename.

4. **`videoRefs` is required (empty array default).** No existing memories in production — no migration needed. No optional field hacks.

5. **Video chips as separate section, not inline highlights.** Chips render above the memory text in both MemoryCheckpoint and AiAssistantSettings. No need to parse/match titles within text.

6. **System prompt format matches L1.** `crossConversationLayer` outputs `[id: videoId]` annotation — same format as persistent context layer — so AI recognizes the same video across layers.

## Agent Orchestration Strategy

Main context = executor + orchestrator. Subagents for review gates only.
Feature is small (3 phases) — no parallelization needed within phases.

## Phase Status

| Phase | Goal | Status |
|-------|------|--------|
| P1 | Backend: extraction + structured output + save | DONE |
| P2 | Types + cross-conversation layer | DONE |
| P3 | Frontend UI (chips in MemoryCheckpoint + Settings) | DONE |
| FINAL | npm run check + tests + review | DONE |

## Current Test Count

**657 tests** (45 files) — baseline was 649, added 8 tests for extractCandidateVideos.

---

## P1 — Backend: Video Extraction + Structured Output

**Goal:** `concludeConversation` extracts candidate videos, passes them to LLM, gets structured response with `referencedVideoIds`, saves `videoRefs` to Firestore.

### Critical Context

- `concludeConversation.ts` already reads all messages with `appContext` (line 60-79)
- `generateConcludeSummary` in `memory.ts` currently returns `{ text, tokenUsage }` — needs to return `{ text, referencedVideoIds, tokenUsage }`
- Gemini structured output: use `responseMimeType: "application/json"` + `responseSchema` in config
- `mentionVideo` tool results live in `msg.toolCalls[].result` where `name === 'mentionVideo'` and `result.found === true`

### Tasks

- [x] **T1.1** `functions/src/services/memory.ts` — add `extractCandidateVideos(messages)` function
  - Scan `msg.appContext` for `type: 'video-card'` items → extract `{ videoId, title, ownership, thumbnailUrl }`
  - Scan `msg.toolCalls` for `name: 'mentionVideo'` with `result.found === true` → extract same fields
  - Deduplicate by `videoId` (appContext wins if conflict — has richer data from user selection)
  - Return `Map<string, MemoryVideoRef>`

- [x] **T1.2** `functions/src/services/memory.ts` — update `generateConcludeSummary`
  - Accept new param `candidateVideos: MemoryVideoRef[]`
  - Add video list to user prompt: `"Videos from this conversation (use exact titles):\n- \"Title\" [id: X] (ownership)\n..."`
  - Add to system prompt: `"Always reference videos by exact title. Never use vague phrases like 'one video' or 'the competitor's video'."`
  - Add instruction: `"Return ONLY a JSON object with two fields: content (markdown insight) and referencedVideoIds (array of videoId strings from the list above — only videos your insight directly discusses, not every video mentioned in passing)."`
  - Use Gemini JSON mode: `responseMimeType: "application/json"` + `responseSchema` with `{ content: string, referencedVideoIds: string[] }`
  - Parse response, return `{ text: parsed.content, referencedVideoIds: parsed.referencedVideoIds, tokenUsage }`
  - Fallback: if JSON parsing fails, return `{ text: rawText, referencedVideoIds: [], tokenUsage }` — graceful degradation

- [x] **T1.3** `functions/src/chat/concludeConversation.ts` — wire new flow
  - Call `extractCandidateVideos(allMessages)` to get candidates
  - Pass candidates to `generateConcludeSummary`
  - Filter candidates by `referencedVideoIds` from LLM response → final `videoRefs[]`
  - Save `videoRefs` array on memory doc alongside `content`

- [x] **T1.4** `functions/src/services/__tests__/memory.test.ts` — tests
  - `extractCandidateVideos`: from appContext only, from toolCalls only, from both (dedup), empty messages
  - `generateConcludeSummary`: mock Gemini, verify JSON mode config, verify video list in prompt, verify fallback on parse error

### Verification

```bash
cd functions && npx vitest run src/services/__tests__/memory.test.ts
```

### MANDATORY: Update this file before proceeding
- [x] Mark tasks complete
- [x] Update phase status table
- [x] Record test count delta (+8 tests for extractCandidateVideos)

---

## P2 — Types + Cross-Conversation Layer

**Goal:** Frontend types include `videoRefs`, system prompt for future chats includes video references.

### Critical Context

- `ConversationMemory` is in `src/core/types/chat/chat.ts:101` — used by both frontend and store
- `MemoryVideoRef` type should live near `ConversationMemory` (same file)
- `crossConversationLayer.ts` is tiny (27 lines) — formats memories for system prompt
- Format must match L1 persistent context: `[id: videoId]` annotation

### Tasks

- [x] **T2.1** `src/core/types/chat/chat.ts` — add `MemoryVideoRef` interface + update `ConversationMemory`
  ```ts
  export interface MemoryVideoRef {
      videoId: string;
      title: string;
      ownership: 'own-published' | 'own-draft' | 'competitor';
      thumbnailUrl: string;
  }

  // Add to ConversationMemory:
  videoRefs: MemoryVideoRef[];
  ```

- [x] **T2.2** `src/core/ai/layers/crossConversationLayer.ts` — include videoRefs in output
  - If `m.videoRefs?.length > 0`: add line `**Videos referenced:** "Title" [id: X] (ownership), ...` before content
  - Keep existing formatting, just add the videos line between header and content

### Verification

```bash
npm run typecheck
```

### MANDATORY: Update this file before proceeding
- [x] Mark tasks complete
- [x] Update phase status table

---

## P3 — Frontend UI (Video Chips)

**Goal:** Both MemoryCheckpoint (in chat) and AiAssistantSettings (in settings) show video reference chips above memory text.

### Critical Context

- Both components already render memory content with ReactMarkdown + remarkGfm
- Both have nearly identical structure — shared chip component avoids duplication
- Thumbnail URLs are YouTube CDN URLs (public, no auth needed)
- Chips should be small: mini thumbnail (24-28px) + title text, horizontal scroll if many
- Existing design tokens: `--accent`, `--bg-primary`, `var(--settings-menu-active)`

### Tasks

- [x] **T3.1** Create `src/features/Chat/components/MemoryVideoChips.tsx` — shared component
  - Props: `videoRefs: MemoryVideoRef[]`
  - Renders horizontal row of chips: `[thumbnail img + title]`
  - Chip style: small rounded pill, thumbnail 24px, text 11px, subtle bg
  - Overflow: horizontal scroll with `overflow-x: auto`, no wrap
  - Empty state: render nothing if `videoRefs` is empty

- [x] **T3.2** `src/features/Chat/components/MemoryCheckpoint.tsx` — integrate chips
  - Import `MemoryVideoChips`
  - Render above the markdown content (inside expanded section)
  - Only show when `memory.videoRefs?.length > 0`

- [x] **T3.3** `src/features/Settings/components/AiAssistantSettings.tsx` — integrate chips
  - Import `MemoryVideoChips`
  - Render above the markdown content (inside each memory card)
  - Only show when `mem.videoRefs?.length > 0`

### Verification

```bash
npm run typecheck && npm run lint
```

### MANDATORY: Update this file before proceeding
- [x] Mark tasks complete
- [x] Update phase status table

---

## FINAL — Check + Tests + Review

### Verification

```bash
npm run check
npm run test:run
npx vitest run --project functions
```

### Review checklist

1. `extractCandidateVideos` — handles empty appContext, empty toolCalls, deduplication?
2. Structured output — fallback if Gemini returns invalid JSON?
3. `videoRefs` — saved correctly to Firestore? Filtered by LLM selection?
4. `crossConversationLayer` — format matches L1 persistent context `[id: ...]`?
5. UI chips — render correctly with 0, 1, 5+ videos? Thumbnails load?
6. No regressions in existing memory flow (memories without videoRefs = empty array)?

### MANDATORY: Update this file
- [x] All phases DONE
- [x] Final test count recorded (657 tests, +8)
- [x] Feature doc `memory-system.md` updated (current state, technical implementation)
