# Video Reference Marks — Task Doc

## Overview

Semantic video references across the entire KI + editor stack: LLM writes `[title](vid://ID)` links, frontend renders as interactive mentions with tooltip, Tiptap Mark enables editing + `@` autocomplete. Replaces current regex-based `linkifyVideoRefs` approach.

**Feature doc:** `docs/features/knowledge/knowledge-items.md`

## Quick Context Recovery

1. This file (architecture + tasks)
2. `docs/features/knowledge/knowledge-items.md` — KI feature doc, "Video reference highlighting" section
3. `functions/src/services/tools/definitions.ts` — `saveKnowledge` tool definition (add `vid://` instruction)
4. `src/features/Knowledge/components/KnowledgeCard.tsx` — current `linkifyVideoRefs` + `mention://` approach (to be migrated)
5. `src/components/ui/organisms/RichTextEditor/` — Tiptap editor (extensions, hooks, types)
6. `src/features/Chat/components/VideoReferenceTooltip.tsx` — tooltip component (reuse)
7. `src/features/Knowledge/utils/videoRefMap.ts` — `buildVideoRefMap` (own videos only, to be extended)
8. `src/components/ui/organisms/RichTextEditor/extensions/VideoIdHighlight.ts` — current decoration approach (to be replaced by Mark)

## Key Decisions (carry forward)

1. **LLM writes `[title](vid://ID)` — not raw IDs.** One instruction in `saveKnowledge` tool description. LLM already knows titles from tool results. Zero extra tool calls. Zero extra tokens. Structured markdown link format.

2. **`vid://` as universal URI scheme.** Same scheme across all renderers: ReactMarkdown (read-only), Tiptap Mark (edit mode), chat messages (future). Distinct from `mention://` (chat-only, uses reference numbers like "Video #3").

3. **Mark, not Decoration.** ProseMirror Decorations are CSS-only (no React, no tooltip). Marks are semantic — part of document model, rendered via React NodeView. Current `VideoIdHighlight` decoration extension → replaced by `VideoRefMark`.

4. **Markdown roundtrip: `vid://` links preserved as-is.** `[title](vid://ID)` is valid markdown. Turndown outputs it unchanged. `marked` parses it as `<a href="vid://ID">title</a>`. No custom Turndown rule needed — links roundtrip natively.

5. **`@` autocomplete with 2+ char threshold.** `@` activates mention mode. Dropdown appears after 2+ characters typed. `allowSpaces: true` — query continues through spaces (`@autumn playlist`). Enter/click → insert mark. Esc → cancel.

6. **Video catalog: own + trend channel videos.** `useVideosCatalog` hook merges `useVideos` (own) + trend channel video titles. Lightweight: only `{ id, title, thumbnail, ownership }` per video. Loaded once, cached.

7. **Backward compatibility.** Old KI with raw video IDs → `linkifyVideoRefs` still runs as fallback in read-only renderer. Converts raw IDs to `[title](vid://ID)` at render time. Not in stored content.

8. **`inclusive: false` on Mark.** Typing after a video mention does NOT extend the mark. Same as bold/italic boundary behavior.

9. **No `refType`/`index` for `vid://` links.** `VideoReferenceTooltip` receives only `label` + `video` in KI context. The `refType`/`index` props are legacy from chat reference numbering ("Video #3") — not applicable to `vid://` links. Clean up in Phase 4.

## Agent Orchestration Strategy

Main context = **executor + orchestrator**.
Subagents for: review gates, parallel UI components.

### Phase parallelization plans

```
Phase 1: LLM output format + read-only renderer
  T1.1 + T1.2 — PARALLEL (tool description + conclude prompt — independent files)
  T1.3 — SEQUENTIAL after T1.1 (bodyComponents need vid:// scheme defined)
  T1.4 + T1.5 — PARALLEL (linkifyVideoRefs migration + saveKnowledge regex — independent)
  T1.6 — SEQUENTIAL after T1.4 (tests for linkifyVideoRefs output)
  T1.7 + T1.8 — PARALLEL (roundtrip test + manual verify — independent)
  → Review Gate 1

Phase 2: VideoRefMark + React NodeView
  T2.1 — SEQUENTIAL FIRST (mark extension — foundation)
  T2.2 + T2.3 — PARALLEL (MarkView component + React Context — independent)
  T2.4 — SEQUENTIAL after T2.1 (register in useEditorExtensions)
  T2.5 — SEQUENTIAL LAST (tests)
  → Review Gate 2

Phase 3: @autocomplete + video catalog
  T3.0 — SEQUENTIAL FIRST (npm install)
  T3.1 + T3.2 — PARALLEL (useVideosCatalog hook + suggestion plugin — independent)
  T3.3 + T3.4 — PARALLEL (dropdown UI after T3.2 + filter tests after T3.1 — independent)
  T3.5 — SEQUENTIAL LAST (wiring: hook → props → extension)
  → Review Gate 3

Phase 4: Integration + cleanup
  T4.1 + T4.2 + T4.3 — PARALLEL (separate scopes, no deps)
  T4.4 — SEQUENTIAL after T4.1-T4.3 (delete old code after new confirmed working)
  T4.5 — PARALLEL with T4.4 (VideoReferenceTooltip cleanup — independent)
  T4.6 — SEQUENTIAL LAST (integration tests)
  → Review Gate 4

FINAL:
  R1 (Architecture) → fix findings
  R2 (Production Readiness) → fix findings
```

## Phase Status

| Phase | Goal | Status |
|-------|------|--------|
| 1 | LLM output format + read-only renderer | DONE |
| 2 | VideoRefMark extension + React NodeView | DONE |
| 3 | `@` autocomplete + video catalog | DONE |
| 4 | Integration + cleanup | DONE |
| FINAL | Review + docs | DONE |

## Current Test Count

445 frontend (34 files) + 793 backend (56 files) = **1238 total** (90 files)

---

## Phase 1: LLM Output Format + Read-Only Renderer

**Goal:** LLM writes `[title](vid://ID)` in KI content. Read-only view renders as interactive mentions with tooltip.

### Critical Context

- `saveKnowledge` tool definition: `functions/src/services/tools/definitions.ts` (~line 520)
- `bodyComponents` in `KnowledgeCard.tsx` — custom ReactMarkdown `a` component already handles `mention://`
- `allowMentionUrls` — ReactMarkdown `urlTransform` prop, already passes custom URIs
- `CONCLUDE_INSTRUCTION` in `src/core/config/concludePrompt.ts` — may also need instruction
- ⚠️ `vid://` must pass through ReactMarkdown's URL sanitizer (same pattern as `mention://`)
- ⚠️ Both `vid://` (new, LLM-generated) and `mention://` (legacy, `linkifyVideoRefs`) must coexist

### Tasks

- [x] **T1.1** — Update `saveKnowledge` tool description
  - In `definitions.ts`, add to `saveKnowledge.description` or `parametersJsonSchema.properties.content.description`:
    ```
    "When referencing specific videos in content, use markdown link format:
    [video title](vid://VIDEO_ID). This renders as an interactive mention
    in the UI. Use the exact title from your analysis. Do NOT write the
    video ID as plain text — always wrap in a vid:// link."
    ```
  - ⚠️ Keep instruction concise — it's part of tool schema, consumed on every tool list injection

- [x] **T1.2** — Update `CONCLUDE_INSTRUCTION`
  - Add same `vid://` format instruction to conclude prompt
  - LLM should use `vid://` links in both explicit saves and conclude KI

- [x] **T1.3** — Read-only renderer: `vid://` support in `bodyComponents`
  - In `KnowledgeCard.tsx` `buildBodyComponents()`: extend `a` handler to catch `vid://` in addition to `mention://`:
    ```typescript
    a({ href, children }) {
        if (href && videoMap) {
            // vid:// — LLM-generated video reference
            const vidMatch = /^vid:\/{2,}\s*(.+)$/.exec(href)
            if (vidMatch) {
                const videoId = vidMatch[1]
                const video = videoMap.get(videoId) ?? null
                return <VideoReferenceTooltip label={String(children)} video={video} />
            }
            // mention:// — legacy linkifyVideoRefs fallback
            const mentionMatch = MENTION_RE.exec(href)
            if (mentionMatch) { ... }
        }
        return <a href={href} target="_blank" rel="noreferrer">{children}</a>
    }
    ```
  - Same change in `MemoryCheckpoint.tsx` `bodyComponents`
  - `allowMentionUrls` already passes all URLs through — no change needed

- [x] **T1.4** — Migrate `linkifyVideoRefs` output to `vid://` scheme
  - Keep as fallback for old KI with raw IDs (pre-`vid://` content)
  - Change output: `[title](vid://ID)` instead of `[ID](mention://ID)` — unify on `vid://` scheme
  - Note: `mention://` is never persisted — only generated by `linkifyVideoRefs` at render time. No stored content uses `mention://`. Safe to change output format without migration.

- [x] **T1.5** — Update `saveKnowledge` video ref extraction for `vid://` links
  - Current regex: `/\b([A-Za-z0-9_-]{11}|custom-\d+)\b/g` — only raw IDs
  - Add: `/vid:\/\/([A-Za-z0-9_-]+)/g` — extract IDs from `vid://` links
  - Merge both candidate sets before `resolveVideosByIds`
  - Without this, new KI with `vid://` links won't have `resolvedVideoRefs`
  - Location: `functions/src/services/tools/handlers/knowledge/saveKnowledge.ts` (~line 168)

- [x] **T1.6** — Tests: `linkifyVideoRefs` output format
  - Unit test: `linkifyVideoRefs` outputs `[title](vid://ID)` (not `mention://`)
  - Unit test: `linkifyVideoRefs` with no matches returns unchanged markdown
  - Unit test: `linkifyVideoRefs` doesn't double-wrap existing `vid://` links

- [x] **T1.7** — Roundtrip assertion test (turndown/marked)
  - Verify: `turndown(marked('[title](vid://A4SkhlJ2mK8)'))` === `[title](vid://A4SkhlJ2mK8)`
  - If Turndown strips `vid://` protocol → add custom Turndown rule to preserve it
  - Add as unit test in `src/components/ui/organisms/RichTextEditor/__tests__/vidRoundtrip.test.ts`
  - Guards against regression on turndown/marked upgrades

- [ ] **T1.8** — Verify: new Memorize produces `vid://` links in KI content (manual, post-deploy)
  - Delete existing KI, trigger Memorize, verify content contains `[title](vid://ID)`
  - Verify read-only view shows titles with tooltip, not raw IDs

### Verification

```bash
npm run test:run    # all tests pass (including new T1.6 tests)
npm run check       # lint + typecheck + doc links
```

**MANDATORY: Update this file before proceeding:**
- [x] Mark all completed tasks above with `[x]`
- [x] Update Phase Status table: Phase 1 → DONE
- [x] Record test count in "Current Test Count" section

### Review Gate 1

Launch **independent subagent** with this prompt:

"Review Phase 1 of Video Reference Marks. Read `docs/features/knowledge/video-ref-marks-tasks.md` for full context. Check:
1. Does `saveKnowledge` tool description instruct LLM to use `[title](vid://ID)` format?
2. Does `CONCLUDE_INSTRUCTION` include the same `vid://` instruction?
3. Does `bodyComponents.a` handler catch both `vid://` (new) and `mention://` (legacy)?
4. Does `linkifyVideoRefs` output `[title](vid://ID)` (not `[ID](mention://ID)`)?
5. Does `saveKnowledge` handler regex extract IDs from both raw text and `vid://` links?
6. Does roundtrip test pass: `turndown(marked('[title](vid://ID)'))` === `[title](vid://ID)`?
7. Are `linkifyVideoRefs` unit tests covering: output format, no matches, no double-wrap?
8. Run `npm run test:run && npm run check`."

**Fix all findings before moving to Phase 2.**

---

## Phase 2: VideoRefMark Extension + React NodeView

**Goal:** Edit mode renders `vid://` links as interactive marks with tooltip. User can click, see tooltip, delete mark.

### Critical Context

- Tiptap v3 (^3.20.x) natively supports `addMarkView()` + `ReactMarkViewRenderer` — production API, not experimental
- `import { ReactMarkViewRenderer } from '@tiptap/react'` — renders mark as React component with full lifecycle
- No fallback needed — one clean path via `addMarkView()`
- ⚠️ Tiptap's built-in `Link` extension renders `<a>` tags. `vid://` links may conflict. Need to either extend Link or create separate mark.
- ⚠️ `inclusive: false` — typing after mark should not extend it
- Current `VideoIdHighlight` decoration extension → remove after Mark is working

### Tasks

- [x] **T2.1** — `VideoRefMark` Tiptap extension
  - Create: `src/components/ui/organisms/RichTextEditor/extensions/VideoRefMark.tsx`
  - Mark name: `videoRef`
  - Attributes: `{ videoId: string, title: string }`
  - `parseHTML`: match `<a href="vid://...">` tags
  - `renderHTML`: output `<a href="vid://..." data-video-ref="videoId" class="video-reference-highlight">`
  - `inclusive: false`
  - `excludes: ''` — allow bold/italic inside

- [x] **T2.2** — React MarkView
  - Create: `src/components/ui/organisms/RichTextEditor/components/VideoRefView.tsx`
  - Register via `addMarkView()` + `ReactMarkViewRenderer(VideoRefView)` (Tiptap v3 native API)
  - Wraps mark content in `<PortalTooltip>` with `<VideoPreviewTooltip mode="mini" />`
  - Receives video data via React Context (see T2.3)

- [x] **T2.3** — Video data provider via React Context
  - Create: `VideoRefContext` (`React.createContext<Map<string, VideoPreviewData>>`)
  - `RichTextEditor` wraps editor in `<VideoRefContext.Provider value={videoMap}>`
  - `VideoRefView` (MarkView component) calls `useContext(VideoRefContext)` to access video data
  - Why Context: `addMarkView()` + `ReactMarkViewRenderer` renders MarkView as a React component in the React tree — full Context access. No Tiptap-specific data threading needed.

- [x] **T2.4** — Register `VideoRefMark` in `useEditorExtensions`
  - Add to extensions array
  - Ensure `vid://` URLs are not handled by Tiptap's built-in Link extension (if present)

- [x] **T2.5** — Tests: mark parseHTML/renderHTML roundtrip
  - Unit test: `parseHTML` matches `<a href="vid://ID">` → creates mark with correct attrs
  - Unit test: `renderHTML` outputs `<a href="vid://ID" data-video-ref="ID" class="video-reference-highlight">`
  - Unit test: mark with `inclusive: false` — typing at boundary doesn't extend mark

### Verification

```bash
npm run test:run    # all tests pass (including new T2.5 tests)
npm run check       # lint + typecheck + doc links
```

**MANDATORY: Update this file before proceeding:**
- [x] Mark all completed tasks above with `[x]`
- [x] Update Phase Status table: Phase 2 → DONE
- [x] Record test count in "Current Test Count" section

### Review Gate 2

Launch **independent subagent** with this prompt:

"Review Phase 2 of Video Reference Marks. Read `docs/features/knowledge/video-ref-marks-tasks.md` for full context. Check:
1. Does `VideoRefMark` use `addMarkView()` + `ReactMarkViewRenderer` (not decoration or custom DOM)?
2. Is `inclusive: false` set on the mark?
3. Does `VideoRefView` use `useContext(VideoRefContext)` for video data (not extension storage)?
4. Does `PortalTooltip` + `VideoPreviewTooltip` render correctly inside MarkView?
5. Is `VideoRefMark` registered in `useEditorExtensions`?
6. Does `parseHTML` match `<a href="vid://...">` correctly?
7. Does `renderHTML` output correct HTML with `data-video-ref` attr?
8. Do mark roundtrip tests pass (parseHTML → renderHTML → parseHTML)?
9. Run `npm run test:run && npm run check`."

**Fix all findings before moving to Phase 3.**

---

## Phase 3: `@` Autocomplete + Video Catalog

**Goal:** Typing `@` + 2 chars in editor opens dropdown with matching videos. Selecting inserts `[title](vid://ID)` mark.

### Critical Context

- Tiptap `Suggestion` utility: `@tiptap/suggestion` — built-in autocomplete framework
- Used by Tiptap `Mention` extension — but we need custom behavior (insert link mark, not mention node)
- Suggestion config: `char: '@'`, `allowSpaces: true`, `startOfLine: false`
- `items` callback: receives `{ query }` → return filtered video list
- `render` callback: React component for dropdown
- ⚠️ `@tiptap/suggestion` may need separate install
- ⚠️ Dropdown must be Portal-based (escape editor overflow constraints)
- ⚠️ Min 2 chars before showing results: filter `items` to return `[]` when `query.length < 2`

### Tasks

- [x] **T3.0** — Install `@tiptap/suggestion`
  - `npm install @tiptap/suggestion`
  - Required dependency for autocomplete — not currently in package.json

- [x] **T3.1** — Video catalog hook
  - Create: `src/core/hooks/useVideosCatalog.ts`
  - Merges:
    - Own videos from `useVideos()` → `{ id, publishedVideoId, title, thumbnail, ownership: 'own-published' | 'own-draft' }`
    - Trend channel videos from Firestore `trendChannels/*/videos/` → `{ id, title, thumbnail, ownership: 'competitor', channelTitle }`
  - Returns: `VideoPreviewData[]` sorted by title
  - Caching: TanStack Query with `staleTime: 5min`
  - ⚠️ Trend channels may have hundreds of videos. Limit to channels that user has actually synced (existing `trendChannels/` subcollections).
  - ⚠️ Load only `{ id, title, thumbnail }` fields from trend videos — not full docs

- [x] **T3.2** — Autocomplete suggestion plugin
  - Create: `src/components/ui/organisms/RichTextEditor/extensions/VideoMention.ts`
  - Uses Tiptap `Suggestion` utility
  - Config:
    ```typescript
    char: '@',
    allowSpaces: true,
    startOfLine: false,
    items: ({ query }) => {
        if (query.length < 2) return []
        return catalog.filter(v => v.title.toLowerCase().includes(query.toLowerCase())).slice(0, 10)
    },
    command: ({ editor, range, props }) => {
        // Delete @query text, insert marked text (ProseMirror JSON, not markdown)
        editor.chain()
            .focus()
            .deleteRange(range)
            .insertContent({
                type: 'text',
                text: props.title,
                marks: [{
                    type: 'videoRef',
                    attrs: { videoId: props.videoId, title: props.title },
                }],
            })
            .run()
    }
    ```

- [x] **T3.3** — Autocomplete dropdown UI
  - Create: `src/components/ui/organisms/RichTextEditor/components/VideoSuggestionList.tsx`
  - Portal-based floating dropdown (positioned relative to cursor)
  - Per item: thumbnail (40x28) + title + channel name (for competitors) + view count
  - Keyboard: Arrow Up/Down, Enter to select, Esc to cancel
  - Max 10 results visible, scrollable if more
  - Design: match `Dropdown` molecule style (`bg-bg-secondary border-border rounded-xl shadow-2xl`)
  - ⚠️ Reference implementation: chat SelectionToolbar's "Save to Video" dropdown

- [x] **T3.4** — Tests: autocomplete items filter
  - Unit test: `items({ query: '' })` returns `[]` (below threshold)
  - Unit test: `items({ query: 'a' })` returns `[]` (1 char, below threshold)
  - Unit test: `items({ query: 'au' })` returns matching videos
  - Unit test: `items({ query: 'autumn playlist' })` matches with spaces
  - Unit test: max 10 results returned

- [x] **T3.5** — Pass catalog to editor
  - `RichTextEditorProps`: add `videoCatalog?: VideoPreviewData[]`
  - `useEditorExtensions`: pass catalog to `VideoMention` extension options
  - `KnowledgeItemModal` + `MemoryCheckpoint`: pass catalog from `useVideosCatalog()`

### Verification

```bash
npm run test:run    # all tests pass (including new T3.4 tests)
npm run check       # lint + typecheck + doc links
```

**MANDATORY: Update this file before proceeding:**
- [x] Mark all completed tasks above with `[x]`
- [x] Update Phase Status table: Phase 3 → DONE
- [x] Record test count in "Current Test Count" section

### Review Gate 3

Launch **independent subagent** with this prompt:

"Review Phase 3 of Video Reference Marks. Read `docs/features/knowledge/video-ref-marks-tasks.md` for full context. Check:
1. Is `@tiptap/suggestion` installed in `package.json`?
2. Does `useVideosCatalog` merge own videos + trend channel videos?
3. Does `useVideosCatalog` load only lightweight fields (id, title, thumbnail) for trend videos?
4. Does autocomplete return `[]` for query.length < 2?
5. Does `allowSpaces: true` work correctly (`@autumn playlist` matches)?
6. Does `command` insert ProseMirror JSON mark (not markdown string)?
7. Is dropdown Portal-based (escapes editor overflow)?
8. Does dropdown show both own and competitor videos with correct ownership styling?
9. Max 10 results enforced?
10. Run `npm run test:run && npm run check`."

**Fix all findings before moving to Phase 4.**

---

## Phase 4: Integration + Cleanup

**Goal:** Unify all video reference rendering, remove legacy code, ensure consistency.

### Tasks

- [x] **T4.1** — Separate catalog (write) from videoMap (render)
  - `useVideosCatalog` (Phase 3) — **only** for `@` autocomplete dropdown in edit mode. Full catalog: own + trend videos.
  - `buildVideoRefMap` + `resolvedVideoRefs` — **keep** for read-only rendering in KnowledgeCard/MemoryCheckpoint. Lightweight: snapshot from KI doc + own videos fallback. No trend video loading for read-only views.
  - Do NOT replace `buildVideoRefMap` with `useVideosCatalog` — different scopes, different performance profiles.

- [x] **T4.2** — Unify `vid://` and `mention://` in body components
  - `KnowledgeCard.bodyComponents.a`: handle both `vid://` (primary) and `mention://` (legacy)
  - `MemoryCheckpoint.bodyComponents.a`: same
  - Chat `MarkdownMessage`: keep `mention://` (chat uses different numbering system)

- [x] **T4.3** — `linkifyVideoRefs` migration
  - Change output: `[title](vid://ID)` instead of `[ID](mention://ID)`
  - Keep as fallback for old KI only
  - Add deprecation comment: "Remove when all KI re-saved with vid:// format"

- [x] **T4.4** — Remove decoration approach
  - Delete `VideoIdHighlight.ts`
  - Remove `videoIds` prop from `RichTextEditorProps` and `types.ts`
  - Remove `videoIds` from `useEditorExtensions`
  - Remove `videoIds` useMemo from `KnowledgePage` and `WatchPageKnowledge`

- [x] **T4.5** — Clean up `VideoReferenceTooltip` API
  - Remove unused `refType` and `index` props from all call sites (KnowledgeCard, ChatMessageList)
  - Make `refType` and `index` optional in the interface (they already are)
  - Remove dead label reconstruction logic inside the component

- [ ] **T4.6** — Integration tests (manual, post-deploy)
  - End-to-end: edit KI → type `@` → select video → save → re-open → mark restored
  - End-to-end: Memorize → KI content has `vid://` links → read-only view shows mentions

### Verification

```bash
npm run test:run    # all tests pass (including new T4.6 tests)
npm run check       # lint + typecheck + doc links
```

**MANDATORY: Update this file before proceeding:**
- [x] Mark all completed tasks above with `[x]`
- [x] Update Phase Status table: Phase 4 → DONE
- [x] Record test count in "Current Test Count" section

### Review Gate 4

Launch **independent subagent** with this prompt:

"Review Phase 4 of Video Reference Marks. Read `docs/features/knowledge/video-ref-marks-tasks.md` for full context. Check:
1. Is `useVideosCatalog` used ONLY for autocomplete (not for read-only rendering)?
2. Is `buildVideoRefMap` + `resolvedVideoRefs` kept for read-only views?
3. Do `bodyComponents.a` handlers catch both `vid://` and `mention://`?
4. Is `linkifyVideoRefs` output format `[title](vid://ID)`?
5. Is `VideoIdHighlight.ts` deleted? `videoIds` prop removed from all files?
6. Are `refType`/`index` removed from KI call sites of `VideoReferenceTooltip`?
7. Does `VideoReferenceTooltip` still work in chat with `refType`/`index` (not broken)?
8. Do integration tests pass: edit → @ → select → save → re-open → mark restored?
9. Run `npm run test:run && npm run check`."

**Fix all findings before moving to FINAL.**

---

## FINAL: Double Review-Fix Cycle

Two independent subagents review the **entire** feature implementation (all Phases 1-4). Each subagent gets a fresh context — no shared state with executor.

### R1: Architecture Review

Launch **independent subagent** with this prompt:

"You are a senior architect reviewing the Video Reference Marks feature. This is a FULL implementation review — not a per-phase gate. Read these files in order:
1. `docs/features/knowledge/video-ref-marks-tasks.md` (this task doc — architecture, decisions)
2. `docs/features/knowledge/knowledge-items.md` (KI feature doc — broader context)

Then review ALL implementation files. Check every point:

1. **`vid://` consistency:** Is `vid://` the ONLY scheme used for new video references? No lingering `mention://` in new code paths? `mention://` only in legacy fallback (`linkifyVideoRefs`) and chat (`MarkdownMessage`)?
2. **Mark architecture:** Does `VideoRefMark` use `addMarkView()` + `ReactMarkViewRenderer`? Is `inclusive: false`? Does `excludes: ''` allow coexisting marks?
3. **React Context:** Does `VideoRefView` use `useContext(VideoRefContext)` — not extension storage, not props drilling?
4. **Turndown roundtrip:** Is `[title](vid://ID)` preserved through `markdown → HTML → markdown` cycle? Any risk of protocol stripping?
5. **`saveKnowledge` regex:** Does video ID extraction match both raw IDs and `vid://` links? Are both candidate sets merged before `resolveVideosByIds`?
6. **Catalog separation:** `useVideosCatalog` (full, for autocomplete) is NOT used in read-only rendering? Read-only uses `resolvedVideoRefs` + `buildVideoRefMap` (lightweight)?
7. **`@` autocomplete:** `command` inserts ProseMirror JSON mark (not markdown string)? `allowSpaces: true`? Min 2 chars? Max 10 results?
8. **Backward compat:** Old KI with raw IDs still render correctly via `linkifyVideoRefs`? Chat `mention://` pattern unaffected?
9. **VideoReferenceTooltip cleanup:** `refType`/`index` removed from KI call sites but preserved for chat?
10. **No dead code:** `VideoIdHighlight.ts` deleted? `videoIds` prop removed everywhere?
11. **Key Decisions 1-9 all honored** in implementation?
12. Run `npm run test:run && npm run check` — all must pass."

**Fix ALL findings before R2.**

### R2: Production Readiness Review

Launch **different independent subagent** with this prompt:

"You are a production engineer reviewing the Video Reference Marks feature for deployment readiness. Read `docs/features/knowledge/video-ref-marks-tasks.md` for context. Then review the implementation. Check every point:

1. **Performance — autocomplete with 500+ videos:** Does `useVideosCatalog` paginate or limit trend video loading? Is `items` callback debounced or is filter fast enough for 500+ entries?
2. **Performance — mark decoration:** Does `addMarkView` create a React component per mark instance? With 50 video refs in one KI, are there 50 mounted React components? Is this acceptable?
3. **Edge cases — `@` in code blocks:** Does typing `@` inside a code block trigger autocomplete? It shouldn't.
4. **Edge cases — `@` in URLs:** Does `@user@email.com` or `@` in a link trigger autocomplete?
5. **Edge cases — multiple `@` mentions:** Can user have two active `@` autocomplete sessions? What happens?
6. **Edge cases — video deleted after mention:** Mark references `vid://ID` but video no longer exists. Does tooltip gracefully fallback?
7. **Tooltip positioning:** In KI edit modal (Portal, z-modal), does PortalTooltip render above the modal? z-index correct?
8. **Mark persistence:** Save KI with marks → close → re-open. Are marks restored from markdown `[title](vid://ID)`? Or lost?
9. **Firestore writes:** Does `useVideosCatalog` create any Firestore listeners for trend videos? How many reads on page load?
10. **Error handling:** `useVideosCatalog` fails to load trend videos — does autocomplete degrade gracefully (show only own videos)?
11. **Bundle size:** `@tiptap/suggestion` — how large? Any unnecessary transitive dependencies?
12. Run `npm run test:run && npm run check` — all must pass."

**Fix ALL findings before final updates.**

### Final updates

- [x] Update `knowledge-items.md` feature doc: new `vid://` video reference architecture
- [x] Update `memory-system.md` if MemoryCheckpoint rendering changed (vid:// + mention:// support added to bodyComponents)
- [x] Record final test count
- [x] Update Phase Status table: FINAL → DONE
- [ ] Move this task doc to `docs/archive/tasks/knowledge/` (after merge)
