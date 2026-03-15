# Video Reference Marks — Task Doc

## Overview

Semantic video references in RichTextEditor: custom Tiptap Mark that renders video IDs as interactive mentions with tooltip, highlight, and click-to-navigate. Foundation for future `@mention` workflow.

**Feature doc:** `docs/features/knowledge/knowledge-items.md` — see "Video reference highlighting" section.

## Quick Context Recovery

1. This file (tasks + architecture)
2. `src/components/ui/organisms/RichTextEditor/` — Tiptap editor (extensions, hooks, types)
3. `src/components/ui/organisms/RichTextEditor/extensions/VideoIdHighlight.ts` — current decoration-based approach (to be replaced)
4. `src/features/Chat/components/VideoReferenceTooltip.tsx` — tooltip component to reuse
5. `src/features/Knowledge/utils/videoRefMap.ts` — builds `Map<videoId, VideoPreviewData>`
6. `src/features/Knowledge/components/KnowledgeCard.tsx` — `linkifyVideoRefs` + `mention://` pattern (read-only)

## Key Decisions (carry forward)

1. **Mark, not Decoration.** Decorations are CSS-only (no React, no tooltip). Marks are semantic — part of document model, rendered via React NodeView.
2. **Markdown roundtrip preservation.** Mark stored in editor, but markdown output = plain video ID (no `mention://` syntax in stored content). Turndown strips mark, leaving raw ID.
3. **Auto-detection, not manual markup.** User types/pastes video ID → editor auto-wraps in mark (like Slack autolink). No explicit `@` trigger needed for IDs.
4. **`@` mention trigger (future).** Typing `@` opens autocomplete dropdown with channel videos. Selecting inserts mark. Built on same Mark infrastructure.
5. **VideoPreviewData as mark attrs.** Mark carries `{ videoId, title?, thumbnailUrl?, ownership? }`. Resolved at mark creation, not at render.
6. **Same visual as read-only.** `video-reference-highlight` CSS class + `VideoReferenceTooltip` + `PortalTooltip`. Identical UX in edit and read mode.

## Agent Orchestration Strategy

Main context = **executor + orchestrator**.
Subagents for: review gates, parallel test writing.

## Phase Status

| Phase | Goal | Status |
|-------|------|--------|
| 1 | VideoRefMark extension + React NodeView | TODO |
| 2 | Auto-detection plugin (InputRule / paste handler) | TODO |
| 3 | Turndown rule (markdown roundtrip) | TODO |
| 4 | Integration (KnowledgeItemModal, MemoryCheckpoint) | TODO |
| 5 | `@` mention autocomplete (future) | TODO |
| FINAL | Review + cleanup | TODO |

## Current Test Count

**Obtain by running `npm run test:run` before starting. Do not copy from other docs.**

---

## Phase 1: VideoRefMark Extension + React NodeView

**Goal:** Create Tiptap Mark that renders video IDs as React components with tooltip.

### Critical Context

- Tiptap v3 marks: `Mark.create({ name, ... })` with `addAttributes`, `parseHTML`, `renderHTML`
- React NodeView for marks: `addNodeView()` → `ReactNodeViewRenderer` — renders mark as React component
- `PortalTooltip` already exists at `src/components/ui/atoms/PortalTooltip`
- `VideoReferenceTooltip` at `src/features/Chat/components/VideoReferenceTooltip.tsx`
- `VideoPreviewTooltip` (mini mode) at `src/features/Video/components/VideoPreviewTooltip.tsx`
- ⚠️ Tiptap v3 Mark NodeView is different from Node NodeView — check Tiptap docs for mark rendering
- ⚠️ Mark must be `inclusive: false` — typing after a video ref should NOT extend the mark
- ⚠️ Mark should be `excludes: ''` — allow other marks (bold, italic) to coexist

### Tasks

- [ ] **T1.1** — `VideoRefMark` extension
  - Create: `src/components/ui/organisms/RichTextEditor/extensions/VideoRefMark.ts`
  - Mark name: `videoRef`
  - Attributes: `{ videoId: string, title?: string, thumbnailUrl?: string, ownership?: string }`
  - `parseHTML`: match `<span data-video-ref="videoId">`
  - `renderHTML`: output `<span data-video-ref="videoId" class="video-reference-highlight">`
  - `inclusive: false` — don't extend mark when typing at boundaries
  - `excludes: ''` — allow coexisting marks

- [ ] **T1.2** — React NodeView for mark
  - Create: `src/components/ui/organisms/RichTextEditor/components/VideoRefView.tsx`
  - Renders: `<PortalTooltip>` wrapping `<span class="video-reference-highlight">`
  - Tooltip content: `<VideoPreviewTooltip video={...} mode="mini" />`
  - Props from mark attrs: `videoId`, `title`, `thumbnailUrl`, `ownership`
  - ⚠️ NodeView for marks works differently than for nodes — may need `markViewRenderer` or inline wrapper

- [ ] **T1.3** — Register in `useEditorExtensions`
  - Add `VideoRefMark` to extensions array
  - Pass `videoMap` (or resolver function) via extension options for NodeView to access video data
  - Remove `VideoIdHighlight` decoration extension (replaced by mark)

### Verification

```bash
npm run check
```

---

## Phase 2: Auto-detection Plugin

**Goal:** Automatically wrap video IDs in `videoRef` mark when typed or pasted.

### Critical Context

- Tiptap `InputRule` — regex-based, triggers on typing
- ProseMirror `Plugin` with `appendTransaction` — triggers on any doc change (including paste)
- Need both: InputRule for typing, appendTransaction for paste
- `videoIds: Set<string>` determines which IDs to detect
- ⚠️ Don't auto-mark inside code blocks or existing marks
- ⚠️ Performance: scanning full doc on every change. For 58 IDs + typical KI content — negligible. For 500+ IDs — may need debounce

### Tasks

- [ ] **T2.1** — Auto-mark plugin
  - Create detection logic: scan text nodes for video IDs from `videoIds` Set
  - On match: apply `videoRef` mark with attrs from `videoMap`
  - Skip: code blocks, existing `videoRef` marks
  - Trigger: `appendTransaction` (covers typing + paste + programmatic changes)

- [ ] **T2.2** — Remove mark on edit
  - If user edits text inside a video ref mark (changes the ID) → remove mark
  - If user deletes part of a video ref → remove mark from remaining text

### Verification

```bash
npm run check
# Manual test: type a video ID in editor → should auto-highlight with tooltip
# Manual test: paste text with video IDs → should auto-highlight
```

---

## Phase 3: Turndown Rule (Markdown Roundtrip)

**Goal:** Preserve clean markdown — video IDs stored as plain text, not HTML marks.

### Critical Context

- Turndown converts editor HTML → markdown on every change
- Current: `<span data-video-ref="id" class="video-reference-highlight">A4SkhlJ2mK8</span>` → should output `A4SkhlJ2mK8` (plain text)
- Without custom rule: Turndown will either strip the span (losing content) or output HTML
- `useTurndownService.ts` — add custom rule

### Tasks

- [ ] **T3.1** — Turndown rule for `videoRef` spans
  - Add rule in `useTurndownService.ts`
  - Filter: `node.nodeName === 'SPAN' && node.hasAttribute('data-video-ref')`
  - Replacement: `content` (just the text inside, stripping the mark)
  - This ensures markdown stays clean — no `<span>` tags in stored content

- [ ] **T3.2** — Verify roundtrip
  - Type video ID → gets marked → save → re-open → auto-detection re-marks it
  - No `<span>` tags accumulate in stored markdown

---

## Phase 4: Integration

**Goal:** Connect mark system to KnowledgeItemModal, MemoryCheckpoint, and future editors.

### Tasks

- [ ] **T4.1** — KnowledgeItemModal
  - Pass `videoMap` to RichTextEditor (for mark attrs resolution)
  - Remove `videoIds: Set<string>` prop (replaced by mark system)

- [ ] **T4.2** — MemoryCheckpoint edit mode
  - Pass `videoMap` to RichTextEditor in edit mode

- [ ] **T4.3** — Cleanup
  - Remove `VideoIdHighlight.ts` decoration extension (replaced)
  - Remove `videoIds` prop from `RichTextEditorProps` (replaced by `videoMap`)
  - Update `linkifyVideoRefs` in KnowledgeCard — still needed for read-only mode (ReactMarkdown, not Tiptap)

---

## Phase 5: `@` Mention Autocomplete (Future)

**Goal:** Typing `@` opens autocomplete dropdown with channel videos.

### Tasks

- [ ] **T5.1** — Autocomplete extension
  - Tiptap `Suggestion` utility (built-in) — trigger on `@`
  - Dropdown: list of videos from `videoMap`, filterable by title
  - Select → insert `videoRef` mark with full attrs

- [ ] **T5.2** — UI
  - Floating dropdown (Portal, positioned relative to cursor)
  - Video thumbnail + title + view count
  - Keyboard navigation (arrow keys + Enter)

---

## FINAL: Review + Cleanup

### R1: Architecture Review

- Mark attrs contain minimal video data (videoId required, rest optional)
- Auto-detection doesn't fire in code blocks
- Markdown roundtrip is clean (no HTML leakage)
- Read-only mode (KnowledgeCard) still uses `linkifyVideoRefs` (separate pipeline)
- Edit mode uses Mark + NodeView (Tiptap pipeline)

### R2: Production Readiness

- Performance: auto-detection with 500+ IDs
- Edge cases: video ID inside URL, inside code block, inside existing mention
- Tooltip positioning in scroll containers
- Mark removal when ID text is edited
