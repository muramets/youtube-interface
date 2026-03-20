# Sticky Scroll Rewrite — Task Document

## Current Status: WORKING — all P1-P4 + gap + anti-duplication + load-earlier

### What works
- **P1 (pin):** User sends message → `setIsPinned(true)` → `useLayoutEffect` sets `zone.style.minHeight` + `scrollIntoView` + residualGap flush → message pinned at top before paint with 12px visual gap. ✅
- **P2 (streaming):** Streaming content grows below pinned message. Sticky keeps zone at top. Gap maintained by CSS `padding-top: 12px` inside `.chat-sticky-zone`. ✅
- **P3 (streaming ends):** Lazy approach — `intent → idle`, no DOM changes. User stays in pinned view with message at top + response below. Cleanup on next P1 or scrollToBottom. ✅
- **Split-map DOM:** Messages split at `splitIndex` (last user message). Zone always wraps last user msg + everything after. No React remount on pin toggle. ✅
- **Away detection + re-pin:** User scrolls to history (intent=away), scrolls back during streaming (re-pin via `isStreamingRef`). ✅
- **FAB context-aware:** Hidden when pinned, returns to pin position during streaming, scrolls to bottom after streaming. ✅
- **handleScroll lazy cleanup:** Collapses spacer when idle. ✅
- **Anti-duplication:** Streaming block suppressed when last `visibleMessage` is already `role: 'model'` (Firestore write can land before SSE ends). ✅
- **Load earlier messages:** Bulk prepend (countDelta > 1) while pinned → re-flush zone via `scrollIntoView` in `useLayoutEffect`. Scroll position preserved. ✅

### Known minor behaviors (not bugs)
- When "Load earlier messages" button disappears (all history loaded), the scroll container grows by ~30px (button height). Content shifts by that amount. Expected — button is outside the scroll container in ChatPanel layout.

---

## Architecture Decisions (finalized)

1. **CSS `position: sticky; top: 0` + `padding-top: 12px`** — compositor-native pinning, zero jitter. `top: 0` sticks flush to scrollport; `padding-top` provides 12px visual gap covered by `--card-bg` background (prevents pre-zone content peeking through).
2. **Split-map** — messages split at `splitIndex` (last user message). No remount on pin toggle.
3. **`scrollIntoView` + residualGap flush** — `scrollIntoView({ block: 'start' })` positions zone near scrollport top. Then `residualGap = zone.rect.top - container.rect.top` is added to `scrollTop` to make zone flush. Zone's own `padding-top` provides the visual gap. Consistent regardless of "Load earlier messages" button presence.
4. **P3 lazy approach** — streaming ends → only set `intent = 'idle'`. No DOM changes, no scroll manipulation. User stays in pinned view. Cleanup on next P1 or scrollToBottom.
5. **`useLayoutEffect` for P1 + prepend preservation** — positions zone before paint (zero frame delay). Also handles "Load earlier messages": when `countDelta > 1` while pinned, re-runs flush logic (idempotent, ignores Chrome's partial anchoring).
6. **`isStreamingRef`** — ref mirror for `isStreaming`, used in stable callbacks (handleScroll, scrollToBottom).
7. **Spacer managed via DOM only** — no React-controlled `style={{ minHeight: 0 }}` on spacer div (was causing React to reset spacer on re-render).
8. **`overflow-anchor: none`** on zone div (inline style) — prevents Chrome scroll anchoring from interfering during P1/P2 transitions.
9. **FAB context-aware** — hidden when `intent === 'pinned'`. During streaming: FAB returns to pin position. After streaming: FAB scrolls to bottom + full cleanup.
10. **Anti-duplication guard** — streaming block render condition: `isStreaming && visibleMessages[last]?.role !== 'model'`. Prevents 2-3 frame overlap when Firestore model message arrives before SSE ends.

---

## Files Modified

| File | Changes |
|------|---------|
| `src/features/Chat/hooks/useChatScroll.ts` | Sticky state machine: P1 flush positioning (scrollIntoView + residualGap), P3 lazy, bulk prepend scroll preservation, prevScrollHeightRef + prevMsgCountLayoutRef |
| `src/features/Chat/ChatMessageList.tsx` | Split-map DOM, streaming block anti-duplication guard (`visibleMessages[last]?.role !== 'model'`), overflow-anchor inline style, spacer without controlled style |
| `src/features/Chat/Chat.css` | `.chat-sticky-zone` class: `sticky, top:0, padding-top:12px, z-index:1, background:var(--card-bg)` |
| `src/features/Chat/hooks/__tests__/useChatScroll.test.ts` | 17 tests: P1, P2, P3 (lazy), P4, FAB, away/re-pin, scrollToBottom, full cycle |

## Quick Context Recovery (for next session)

Read in this order:
1. **This file** — current status + architecture decisions
2. `src/features/Chat/hooks/useChatScroll.ts` — the hook (~300 lines)
3. `src/features/Chat/ChatMessageList.tsx` — split-map DOM structure (lines 580-760)
4. `src/features/Chat/Chat.css` — `.chat-sticky-zone` class (line ~108)

## Test Count

- **Frontend: 579 tests (42 files)** — all passing
- **Backend: 874 tests (61 files)** — all passing (not affected by this refactor)

## Key Learnings (carry forward)

1. **`zone.offsetTop` is unreliable for sticky elements** in flex containers with gaps. Use `scrollIntoView` instead.
2. **React-controlled inline styles on spacer** (`style={{ minHeight: 0 }}`) reset DOM-manipulated values on re-render. Use uncontrolled spacer (DOM-only via ref).
3. **`useEffect` runs AFTER paint** — any scroll/position changes cause 1-frame flash. Use `useLayoutEffect` for positioning.
4. **Chrome scroll anchoring** adjusts scrollTop when content height changes. `overflow-anchor: none` on the zone helps but doesn't prevent all interference. Children inside the zone can still be used as anchors.
5. **`sticky + top: N` leaves N px transparent gap** — pre-zone content peeks through. Use `top: 0` with `padding-top: N` instead — the padding is covered by the element's background.
6. **`scrollIntoView({ block: 'start' })` doesn't perfectly flush** — leaves a residual gap (flex gap or browser heuristic). Always measure and compensate: `container.scrollTop += zone.rect.top - container.rect.top`.
7. **P3 lazy approach** (no DOM changes when streaming ends) is the cleanest solution — avoids all browser clamping/anchoring issues. User stays in the pinned view, cleanup happens on next action.
8. **Firestore vs SSE race:** Server can write the model message to Firestore before the SSE stream ends on the client. Guard streaming block with `visibleMessages[last]?.role !== 'model'` to prevent duplication.
9. **Bulk prepend scroll preservation:** Delta-based `scrollTop += delta` over-compensates when Chrome also partially anchors. Use absolute positioning (`scrollIntoView` + flush) instead — idempotent regardless of what Chrome already did.
10. **"Load earlier messages" button is outside scroll container** (in ChatPanel). Its appearance/disappearance causes a ~30px layout shift — this is expected and not fixable from the scroll hook.
