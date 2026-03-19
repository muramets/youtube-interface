# Sticky Scroll Rewrite — Task Document

## Problem

Когда пользователь отправляет сообщение в чат, оно "пинится" вверху viewport, а ответ модели стримится ниже. Текущая реализация scroll pinning использует JS-driven подход: `wheel` event handler с `preventDefault()`, программную манипуляцию `scrollTop`, и сложный state machine на 443 строки.

**Что не работает:**

1. **Jitter на macOS trackpad.** Браузер скроллит на compositor thread (отдельный от JS). Compositor рисует "неправильную" scroll позицию → main thread получает `onScroll` → наш handler корректирует `scrollTop` → ещё одна отрисовка. Результат: видимое дрожание на каждом frame при momentum scrolling.

2. **`wheel` + `preventDefault` не привязывается.** `containerRef.current = null` при mount (чат монтируется до отрисовки контейнера). Lazy-attach через handleScroll — хрупкий костыль.

3. **Комбинаторный взрыв edge cases.** Elastic spacer consumption + scroll clamp + streaming state + post-streaming state + resize observation = десятки пересекающихся условий, каждое со своими таймингами.

4. **Пользователь может прокрутить сообщение за пределы видимости** во время стриминга, а обратный scroll "съедает" spacer вместо возврата к сообщению.

5. **Пустое пространство** появляется после завершения стриминга (spacer рассчитан для streaming message, который затем заменяется финальным Firestore message с другой высотой).

## Desired Behavior

1. Отправка сообщения → сообщение pinned вверху viewport, ответ модели стримится ниже
2. Во время стриминга: сообщение остаётся вверху (**zero jitter**, premium feel)
3. Во время стриминга: пользователь МОЖЕТ скроллить вверх чтобы видеть старые сообщения
4. Во время стриминга: пользователь МОЖЕТ вернуться обратно к pinned позиции скроллом вниз
5. После завершения стриминга: свободный скролл для чтения полного ответа
6. После завершения стриминга: нельзя скроллить в пустую spacer зону
7. Никаких прыжков, дрожания, пустых пространств

## Proposed Solution

**CSS `position: sticky` вместо JS scroll manipulation.** Утверждено 3 независимыми elite senior dev review.

**Суть:** обернуть последнее сообщение пользователя + streaming response в `<div>` с `position: sticky; top: 0`. Браузер сам удерживает этот div вверху viewport — на уровне compositor thread, без участия JS. Zero jitter by definition.

**Spacer** (уже существует) даёт sticky элементу "runway" для приклеивания. `ResizeObserver` на sticky zone динамически уменьшает spacer по мере роста response: `spacer = max(0, viewportHeight - zoneContentHeight)`.

**Что удаляется:** ~170 строк — `handleWheel`, `preventDefault`, `programmaticScroll`, `scrollEndCleanup`, `prevScrollTopRef`, `pinnedMaxScrollTopRef`, `isStreamingRef`, `postStreamingRef`, все delta-based spacer consumption/expansion.

**Что добавляется:** ~40 строк — `stickyZoneRef`, `isPinned` state, ResizeObserver на sticky zone, упрощённый P1/P3.

**Что остаётся:** state machine (idle/pinned/away), spacerRef, FAB logic, container ResizeObserver, scrollToBottom.

**Результат:** ~150 строк вместо ~443. Compositor-native pinning. Работает с любым input (trackpad, touch, keyboard, scrollbar).

---

## Overview

Полная перезапись scroll state machine чата: с JS-driven `wheel` event handlers + `preventDefault` + `scrollTop` manipulation на CSS `position: sticky` based pinning. Решает jitter на macOS trackpad (compositor thread vs main thread race condition). Утверждено 3 независимыми review.

**Feature doc:** нет отдельного feature doc — это infrastructure refactor внутри Chat. Архитектурные решения зафиксированы здесь.

---

## Quick Context Recovery

Если потерян контекст — читать в этом порядке:
1. **Этот файл** (статус + чеклисты + архитектурные решения)
2. `src/features/Chat/hooks/useChatScroll.ts` (текущий hook — 443 строки, будет ~150 после rewrite)
3. `src/features/Chat/ChatMessageList.tsx` (consumer — DOM structure, refs, hook destructuring)
4. `src/features/Chat/Chat.css` (scroll styles — `.chat-messages`, `.chat-sticky-zone`)
5. `src/core/utils/debug.ts` (`debug.scroll` logging utility)

---

## Key Decisions (carry forward)

1. **`position: sticky` > `wheel` + `preventDefault`.** Compositor-native = zero jitter. `wheel` events + `preventDefault` fight the compositor thread — compositor paints the scroll frame, then main thread corrects it = visible 1-frame jitter on macOS trackpad inertial scroll. `sticky` is resolved by the compositor directly.

2. **`position: sticky` > `onScroll` clamp.** `onScroll` fires AFTER compositor paints the frame = 1-frame flash of wrong position. Sticky avoids this entirely.

3. **Soft pin is acceptable.** User CAN scroll up past the pinned message (standard chat UX — ChatGPT, Claude.ai do the same). Hard lock would require synthetic scroll events. Removing `wheel` `preventDefault` is the whole point.

4. **ResizeObserver for spacer sizing.** Spacer = `max(0, viewportHeight - zoneContentHeight)`. ResizeObserver fires synchronously before paint (via microtask checkpoint). This replaces the scroll-linked spacer consumption/expansion logic (~60 lines removed).

5. **Message extraction via `findLastIndex`.** When pinned, the last user message is extracted from the `visibleMessages.map()` loop and rendered inside the sticky zone instead. React key stays the same (`msg.id`) so reconciliation doesn't cause remount. The message above it (now last in the map) keeps its Fragment key.

6. **Zone `min-height: 100vh` equivalent.** The sticky zone gets `min-height` equal to `containerRef.clientHeight` to ensure the card-bg background always covers the full viewport — prevents spacer becoming visible behind the zone.

7. **No new dependencies.** Pure CSS + ResizeObserver (supported in all modern browsers). No libraries added.

---

## Agent Orchestration Strategy

Main context = **executor + orchestrator** (keeps cross-phase context).
Subagents for:
- **Review Gates** — read-only checks after each phase (fresh eyes, independent agent)
- **Parallel tasks within phases** — only where marked

### Memory update instructions
After each phase completion:
1. Mark tasks with checkboxes `[x]`
2. Update Phase Status table
3. Record test count (run `npx vitest run --project frontend` + `npx vitest run --project functions`)

---

## Phase Status

| Phase | Goal | Status |
|-------|------|--------|
| 1 | Foundation: CSS class + useChatScroll rewrite (core logic) | TODO |
| 2 | ChatMessageList DOM restructure (sticky zone + message extraction) | TODO |
| 3 | Cleanup + edge case hardening | TODO |
| FINAL | Double review-fix cycle (R1 Architecture + R2 Production Readiness) | TODO |

## Current Test Count

- **Frontend: 562 tests (41 files)** — verified via `npx vitest run --project frontend` (2026-03-19)
- **Backend: 880 tests (61 files)** — verified via `npx vitest run --project functions` (2026-03-19)
- **Total: 1442 tests (102 files)** — all passing

---

## Phase 1: Foundation — CSS Class + useChatScroll Full Rewrite

**Goal:** Add the `.chat-sticky-zone` CSS class and completely rewrite `useChatScroll.ts` from wheel-based to sticky-based scroll management.

### Critical Context

- `useChatScroll.ts` is 443 lines. After rewrite: ~150 lines. This is a FULL REWRITE, not incremental refactor.
- The hook's PUBLIC interface changes minimally: `pinAnchorRef` -> `stickyZoneRef`, new `isPinned: boolean` return value. `handleScroll` stays (FAB logic). `containerRef`, `spacerRef`, `bottomRef` stay.
- `streamingText` dependency is used in the main effect as a trigger for scroll updates during streaming. With sticky CSS, the streaming content grows inside the sticky zone and the browser handles scroll automatically — BUT the spacer still needs dynamic resizing via ResizeObserver. Keep `streamingText` only for the effect that detects message count changes (P1/P2/P3/P4 transitions).
- The current `programmaticScroll` helper uses `scrollend` event + timeout fallback to guard `isProgrammaticRef`. With sticky, we still need programmatic scroll for P1 (scroll to user message position) and P4 (initial load scroll to bottom). Simplify: use just `requestAnimationFrame` + direct `scrollTop` set, no `scrollend` listener needed (sticky CSS handles the rest).
- `console.log` statements in `handleWheel` (~lines 88, 92) must be removed entirely (banned by CLAUDE.md). Replace with `debug.scroll` calls only where needed.
- `debug.scroll` is the correct logger for this module. `debug.scroll` is category-gated and tree-shaken in production.
- The Container ResizeObserver (lines 350-366, auto-scroll when container shrinks) stays as-is — it handles input height changes, independent of scroll state.
- The content region observer (lines 392-421, spacer self-correction) changes from an explicit recalculation to a simpler "if zone height changed, recalculate spacer" pattern.

### Tasks

- [ ] **T1.1** — Add `.chat-sticky-zone` CSS class to `src/features/Chat/Chat.css`
  - Add after the `.chat-messages` block (~line 111):
    ```css
    /* --- Sticky zone: pin-to-top during streaming (compositor-native, no JS jitter) --- */
    .chat-sticky-zone {
        position: sticky;
        top: 0;
        z-index: 1;
        background: var(--card-bg);
        overflow-anchor: none;
    }
    ```
  - `z-index: 1` ensures sticky zone stays above normal flow messages during overlap
  - `background: var(--card-bg)` prevents content below from bleeding through
  - `overflow-anchor: none` prevents Chrome's scroll anchoring from fighting our spacer logic

- [ ] **T1.2** — Full rewrite of `src/features/Chat/hooks/useChatScroll.ts`

  **REMOVE entirely (~170 lines):**
  - `handleWheel` callback (lines 87-126) — wheel event handler with `preventDefault`
  - `wheelAttachedRef`, `attachWheelIfNeeded` (lines 370-377) — lazy wheel attachment
  - `isProgrammaticRef`, `scrollEndCleanupRef` (lines 64-65) — programmatic scroll guards
  - `programmaticScroll` helper (lines 130-150) — scrollend listener + timeout
  - `prevScrollTopRef` (line 73) — scroll delta tracking
  - `pinnedSpacerHeightRef` (line 74) — original spacer height for elastic
  - `pinnedMaxScrollTopRef` (line 76) — pin position clamping
  - `isStreamingRef` mirror (lines 78-79) — was for callbacks that can't access state
  - `postStreamingRef` (lines 81-82) — pre/post streaming phase
  - All scroll-linked spacer consumption/expansion in `handleScroll` (lines 283-329)
  - All `console.log` statements (lines 88, 92-100) — use `debug.scroll` only
  - Wheel cleanup effect (lines 380-387)
  - The `attachWheelIfNeeded()` call in `handleScroll` (line 273)
  - The `programmaticScroll(() => { ... })` wrappers in P1 and scrollToBottom

  **ADD (~40 lines):**
  - `stickyZoneRef: useRef<HTMLDivElement>(null)` (replaces `pinAnchorRef`)
  - `[isPinned, setIsPinned] = useState(false)` return value
  - ResizeObserver on `stickyZoneRef` — watches zone content height, recalculates spacer as `max(0, container.clientHeight - zone.scrollHeight)`
  - **Simplified P1** (user sends message):
    ```
    setIsPinned(true)
    // Spacer is calculated by ResizeObserver callback (fires after DOM update)
    // Scroll to: zone starts at top of viewport
    container.scrollTop = zone.offsetTop
    intent = 'pinned'
    ```
  - **Simplified P3** (streaming ends):
    ```
    // Spacer shrinks to: max(0, container.scrollTop + container.clientHeight - contentHeight)
    // If spacer <= 0, setIsPinned(false), intent = 'idle'
    // Else: intent stays 'pinned', spacer unwinds on next scroll
    ```
  - **Simplified handleScroll:**
    ```
    // FAB logic (same as before)
    setShowScrollFab(distanceFromBottom > 200)
    // Away detection when pinned
    if (intentRef.current === 'pinned' && spacerH <= 0) intent = 'idle'
    // Return from away
    if (intentRef.current === 'away' && distanceFromBottom <= 80) intent = 'idle'
    // Lazy spacer cleanup
    if (spacerH > 0 && intent === 'idle') setSpacer(0)
    ```

  **KEEP (simplified):**
  - `intentRef` with states `idle` / `pinned` / `away`
  - `containerRef`, `spacerRef`, `bottomRef`
  - `showScrollFab` state + `setShowScrollFab`
  - `setSpacer` helper
  - P1 / P2 / P3 / P4 structure (but simplified bodies)
  - Container ResizeObserver effect (lines 350-366, unchanged)
  - `scrollToBottom` callback (simplified — no programmaticScroll wrapper)
  - `prevMsgCountRef`, `prevStreamingRef` for effect dependencies

  **New interface:**
  ```ts
  interface UseChatScrollReturn {
      containerRef: React.RefObject<HTMLDivElement | null>;
      stickyZoneRef: React.RefObject<HTMLDivElement | null>;  // was: pinAnchorRef
      spacerRef: React.RefObject<HTMLDivElement | null>;
      bottomRef: React.RefObject<HTMLDivElement | null>;
      showScrollFab: boolean;
      isPinned: boolean;  // NEW
      scrollToBottom: () => void;
      handleScroll: () => void;
  }
  ```

  - `isPinned` controls whether `ChatMessageList` applies `.chat-sticky-zone` class to the wrapper div
  - When `isPinned` changes from `true` to `false`, the div loses `position: sticky` and flows normally

  **ResizeObserver for sticky zone:**
  ```ts
  useEffect(() => {
      const zone = stickyZoneRef.current;
      const container = containerRef.current;
      if (!zone || !container) return;

      const observer = new ResizeObserver(() => {
          if (intentRef.current !== 'pinned') return;
          const zoneH = zone.scrollHeight;
          const spacerH = Math.max(0, container.clientHeight - zoneH);
          setSpacer(spacerH);
          debug.scroll(`zone resize: zoneH=${zoneH} spacer=${spacerH}`);
      });
      observer.observe(zone);
      return () => observer.disconnect();
  }, [setSpacer]);
  ```

  - This single observer replaces: scroll-linked consumption/expansion (~40 lines), content self-correction observer (~30 lines), and the streaming text scroll trigger
  - Fires when: streaming text grows, tool badges expand/collapse, message reconciliation changes height, thinking bubble opens/closes
  - `scrollHeight` (not `offsetHeight`) captures full content including overflow

  **P1 rewrite (user sends message):**
  ```ts
  if (newCount > prevCount && prevCount > 0 && lastMessageRole === 'user') {
      setIsPinned(true);
      // Initial spacer — ResizeObserver will refine on next frame
      const estimatedMsgH = 60; // conservative, observer corrects
      setSpacer(Math.max(0, container.clientHeight - estimatedMsgH));
      // Scroll so the zone starts at top
      requestAnimationFrame(() => {
          const zone = stickyZoneRef.current;
          if (zone) container.scrollTop = zone.offsetTop;
      });
      intentRef.current = 'pinned';
      return;
  }
  ```

  **P3 rewrite (streaming ends):**
  ```ts
  if (streamingJustEnded) {
      const spacerH = spacerRef.current?.offsetHeight ?? 0;
      if (spacerH <= 0) {
          setIsPinned(false);
          intentRef.current = 'idle';
      }
      // If spacer > 0: stay pinned, user scrolls through content,
      // handleScroll + lazy cleanup will eventually set idle
      return;
  }
  ```

  - `isResizeCompensationRef` is NOT in the current code (mentioned in spec but doesn't exist) — skip

  **scrollToBottom rewrite:**
  ```ts
  const scrollToBottom = useCallback(() => {
      debug.scroll('scrollToBottom clicked');
      intentRef.current = 'idle';
      setIsPinned(false);
      setSpacer(0);
      containerRef.current?.scrollTo({ top: containerRef.current.scrollHeight, behavior: 'smooth' });
  }, [setSpacer]);
  ```

- [ ] **T1.3** — Tests for rewritten `useChatScroll`
  - File: create `src/features/Chat/hooks/__tests__/useChatScroll.test.ts`
  - Testing strategy: use `renderHook` from `@testing-library/react`. Mock `ResizeObserver`, `requestAnimationFrame`, `Element.prototype.scrollTo`.
  - Mock `debug.scroll` (import from `src/core/utils/debug.ts`)
  - Test cases:
    - **Initial state:** `isPinned` is `false`, `showScrollFab` is `false`, `intentRef` is `idle`
    - **P1 — user message pins:** when `messageCount` increases and `lastMessageRole === 'user'`, `isPinned` becomes `true`, spacer is set
    - **P3 — streaming ends unpins:** when `isStreaming` goes `false`, `isPinned` becomes `false` (when spacer is 0)
    - **P4 — initial load scrolls to bottom:** when `messageCount` goes from 0 to N, scroll to bottom
    - **FAB visibility:** `showScrollFab` becomes `true` when `distanceFromBottom > 200`
    - **scrollToBottom resets state:** `isPinned` = false, spacer = 0
    - **P2 — streaming active stays pinned:** when `isStreaming` and intent not `away`, no scroll changes
  - Edge cases:
    - **Streaming without user message (retry):** `isStreaming` starts but `messageCount` unchanged — P2 should activate
    - **Multiple rapid user messages:** P1 fires, then P1 fires again before P3 — re-pin is safe
  - ⚠️ `ResizeObserver` mock: must fire callback when zone height changes. Use `vi.fn()` for constructor, capture callback, invoke manually.
  - ⚠️ Refs: `containerRef.current`, `stickyZoneRef.current` etc. will be null in `renderHook`. Need to assign mock DOM elements after hook mounts. Pattern:
    ```ts
    const mockContainer = { scrollTop: 0, scrollHeight: 1000, clientHeight: 500, scrollTo: vi.fn() };
    Object.defineProperty(result.current.containerRef, 'current', { value: mockContainer, writable: true });
    ```

### Parallelization plan
```
T1.1 — SEQUENTIAL FIRST (CSS class, foundation)
T1.2 — SEQUENTIAL (core rewrite, depends on T1.1 conceptually)
T1.3 — SEQUENTIAL LAST (tests, depends on T1.2)
```

Note: T1.1 and T1.2 are in different files and could technically be parallel, but T1.2 is the critical path and benefits from sequential focus. T1.3 must come after T1.2.

### Verification
```bash
cd /Users/muramets/Documents/youtube-interface
npx vitest run --project frontend -- src/features/Chat/hooks/__tests__/useChatScroll.test.ts
npm run check
```

### MANDATORY: Update this file before proceeding
- [ ] Mark all T1.x tasks as done
- [ ] Update Phase 1 status to DONE
- [ ] Record test count

---

### Review Gate 1

**Prompt for review agent:**

Read these files:
1. `src/features/Chat/hooks/useChatScroll.ts` — the full rewritten hook
2. `src/features/Chat/Chat.css` — new `.chat-sticky-zone` class
3. `src/features/Chat/hooks/__tests__/useChatScroll.test.ts` — tests
4. `src/core/utils/debug.ts` — verify `debug.scroll` is used (not `console.log`)

Answer these specific questions:
1. Are ALL `wheel` event handlers, `preventDefault` calls, and `attachWheelIfNeeded` logic REMOVED? Search for `wheel`, `preventDefault`, `attachWheel` — should return 0 results in useChatScroll.ts.
2. Are ALL `console.log` statements removed from useChatScroll.ts? (CLAUDE.md bans console.log in app code.)
3. Is `isProgrammaticRef` and the `programmaticScroll` helper with `scrollend` listener fully removed?
4. Does the ResizeObserver on `stickyZoneRef` use `scrollHeight` (not `offsetHeight`)? `scrollHeight` captures full content including overflow.
5. Is the spacer formula correct: `max(0, container.clientHeight - zone.scrollHeight)`? When zone is taller than viewport, spacer = 0 (correct for very long user messages).
6. Does P1 set `isPinned = true` AND `intent = 'pinned'`? Both must be set — `isPinned` for CSS class, `intent` for state machine.
7. Does P3 check spacer height before setting `isPinned = false`? If spacer > 0, user can still scroll through residual content.
8. Is the public interface backward-compatible except for the documented changes (`pinAnchorRef` -> `stickyZoneRef`, new `isPinned`)?
9. Do tests mock `ResizeObserver` properly and verify callback behavior?
10. Is `prevScrollTopRef` (scroll delta tracking) fully removed? It was used for elastic spacer consumption — no longer needed with sticky.

Fix all findings before moving to Phase 2.

---

## Phase 2: ChatMessageList DOM Restructure

**Goal:** Restructure `ChatMessageList.tsx` to wrap the pinned user message + streaming response in a sticky zone div, extracting the last user message from the map loop when pinned.

### Critical Context

- `ChatMessageList.tsx` is 708 lines. Changes are concentrated in ~3 areas: hook destructuring, message extraction logic, and the DOM structure near the bottom of the JSX.
- The current DOM order (lines 561-706):
  1. `visibleMessages.map()` — all messages
  2. Trailing memory checkpoints
  3. `<div ref={pinAnchorRef} />` — pin anchor (invisible sentinel)
  4. Streaming message block
  5. Ghost message (stopped response)
  6. Large payload confirmation banner
  7. `<div ref={bottomRef} />` — bottom sentinel
  8. `<div ref={spacerRef} />` — spacer
  9. Scroll FAB
  10. SelectionToolbar
- **New DOM order:**
  1. `visibleMessages.map()` — all messages EXCEPT last user message when pinned
  2. Trailing memory checkpoints
  3. **Sticky zone wrapper** (with `stickyZoneRef`, conditionally `.chat-sticky-zone`):
     - Pinned user message (extracted from map)
     - Streaming message block
     - Ghost message (stopped response)
     - Large payload confirmation banner
     - `<div ref={bottomRef} />`
  4. `<div ref={spacerRef} />` — spacer (OUTSIDE sticky zone)
  5. Scroll FAB
  6. SelectionToolbar
- `spacerRef` MUST be outside the sticky zone. The spacer pushes scroll height but must not be pinned.
- `bottomRef` goes INSIDE the sticky zone — its position changes signal zone content height changes.
- ⚠️ **React key reconciliation:** When `isPinned` toggles, the last user message moves between the map loop and the sticky zone. The `key={msg.id}` stays the same, but React sees it in a different position. This causes unmount+remount (not just re-render). Use `skipAnimation={true}` for the pinned message to avoid animation on mount.
- ⚠️ **Message extraction timing:** `isPinned` state change triggers re-render. On the render where `isPinned` becomes `true`, the message is already excluded from the map and rendered in the sticky zone. The `stickyZoneRef` div gets the `.chat-sticky-zone` class on the same render. CSS `position: sticky` takes effect immediately.
- ⚠️ **findLastIndex:** Use `visibleMessages.findLastIndex(m => m.role === 'user')` to find the message to extract. `findLastIndex` is available in all modern browsers (ES2023). If the project targets older environments, use a manual reverse loop. Check `tsconfig.app.json` for `lib` setting.
- ⚠️ **Zone min-height:** The sticky zone div needs `min-height` equal to viewport to prevent spacer from being visible. Set via inline style: `style={{ minHeight: isPinned ? containerRef.current?.clientHeight : undefined }}`. This ensures card-bg background covers full viewport.

### Tasks

- [ ] **T2.1** — Update hook destructuring in `ChatMessageList.tsx`
  - Change line ~490: `pinAnchorRef` -> `stickyZoneRef`, add `isPinned`
    ```ts
    const {
        containerRef, stickyZoneRef, spacerRef, bottomRef,
        showScrollFab, isPinned, scrollToBottom, handleScroll,
    } = useChatScroll({ ... });
    ```

- [ ] **T2.2** — Add pinned message extraction logic
  - After `visibleMessages` memo (line ~536), add:
    ```ts
    // When pinned, extract last user message from the map loop
    // and render it inside the sticky zone (compositor-native pin-to-top)
    const pinnedMsgIndex = isPinned
        ? visibleMessages.findLastIndex(m => m.role === 'user')
        : -1;
    const pinnedMsg = pinnedMsgIndex >= 0 ? visibleMessages[pinnedMsgIndex] : null;
    ```
  - ⚠️ Check `tsconfig.app.json` `lib` includes `"ES2023"` for `findLastIndex`. If not, use: `let pinnedMsgIndex = -1; if (isPinned) { for (let i = visibleMessages.length - 1; i >= 0; i--) { if (visibleMessages[i].role === 'user') { pinnedMsgIndex = i; break; } } }`

- [ ] **T2.3** — Update the `visibleMessages.map()` to skip extracted message
  - In the map callback (line ~562), add skip condition:
    ```tsx
    {visibleMessages.map((msg, idx) => {
        // Skip pinned message — rendered in sticky zone below
        if (idx === pinnedMsgIndex) return null;
        // ... rest of existing map body ...
    })}
    ```
  - ⚠️ Memory checkpoints between messages must still render. The `checkpointsBefore` filter compares against `visibleMessages[idx - 1]` — skipping the message should not skip its checkpoints. Solution: render checkpoints for the skipped message, but not the message itself:
    ```tsx
    if (idx === pinnedMsgIndex) {
        // Render checkpoints but not the message (it's in the sticky zone)
        return (
            <React.Fragment key={msg.id}>
                {checkpointsBefore.map(mem => (
                    <MemoryCheckpoint key={`checkpoint-${mem.id}`} ... />
                ))}
            </React.Fragment>
        );
    }
    ```

- [ ] **T2.4** — Replace pinAnchor + streaming block with sticky zone wrapper
  - Remove the old pinAnchor div (line ~624):
    ```tsx
    {/* REMOVE: <div ref={pinAnchorRef} className="h-0 -mt-3" /> */}
    ```
  - Wrap the streaming message, ghost message, confirmation banner, and bottomRef in a sticky zone div:
    ```tsx
    {/* Sticky zone: pins user message + streaming response to viewport top */}
    <div
        ref={stickyZoneRef}
        className={`flex flex-col gap-3 ${isPinned ? 'chat-sticky-zone' : ''}`}
        style={{ minHeight: isPinned ? containerRef.current?.clientHeight : undefined }}
    >
        {/* Pinned user message (extracted from map loop) */}
        {pinnedMsg && (
            <MessageErrorBoundary messageId={pinnedMsg.id}>
                <MessageItem
                    msg={pinnedMsg}
                    skipAnimation
                    isFailed={pinnedMsg.role === 'user' && failedMessageId === pinnedMsg.id}
                    isStreaming={isStreaming}
                    onRetry={retryLastMessage}
                    onEdit={setEditingMessage}
                    videoMap={referenceVideoMap}
                    kiMap={referenceKiMap}
                />
            </MessageErrorBoundary>
        )}

        {/* Streaming message */}
        {isStreaming && (
            <div className="chat-message flex flex-col max-w-[85%] self-start animate-message-in mb-2">
                {/* ... existing streaming message JSX (unchanged) ... */}
            </div>
        )}

        {/* Ghost message (stopped response) */}
        {!isStreaming && stoppedResponse && (
            <div className="chat-message flex flex-col max-w-[85%] self-start mb-2 opacity-60">
                {/* ... existing ghost message JSX (unchanged) ... */}
            </div>
        )}

        {/* Thumbnail batch confirmation */}
        {pendingLargePayloadConfirmation && (
            <div className="self-start max-w-[85%] mb-2 animate-fade-in">
                <ConfirmLargePayloadBanner ... />
            </div>
        )}

        <div ref={bottomRef} className="-mt-3" />
    </div>

    {/* Spacer OUTSIDE sticky zone — only adds scrollHeight */}
    <div ref={spacerRef} aria-hidden="true" style={{ minHeight: 0 }} />
    ```

  - ⚠️ The `SelectionToolbar` and scroll FAB remain OUTSIDE the sticky zone (after spacer), unchanged.
  - ⚠️ When `isPinned` is `false`, the sticky zone div is just a transparent flex container with no sticky behavior — messages flow normally.
  - ⚠️ `minHeight` inline style: when `isPinned` is `false`, set `undefined` (no minHeight). When `true`, set `containerRef.current?.clientHeight`. This is read once per render — if container height changes while pinned, the ResizeObserver recalculates the spacer, and next render updates minHeight.

- [ ] **T2.5** — Verify `tsconfig.app.json` supports `findLastIndex`
  - Check `lib` setting in `tsconfig.app.json` includes `"ES2023"` or higher
  - If not, add it or use a manual reverse loop in T2.2

### Parallelization plan
```
T2.1 — SEQUENTIAL FIRST (hook destructuring)
T2.2 + T2.5 — PARALLEL (message extraction + tsconfig check)
T2.3 — after T2.2 (depends on pinnedMsgIndex)
T2.4 — after T2.1 + T2.2 (DOM restructure)
```

### Verification
```bash
cd /Users/muramets/Documents/youtube-interface
npm run check
npx vitest run --project frontend
```

### MANDATORY: Update this file before proceeding
- [ ] Mark all T2.x tasks as done
- [ ] Update Phase 2 status to DONE
- [ ] Record test count

---

### Review Gate 2

**Prompt for review agent:**

Read these files:
1. `src/features/Chat/ChatMessageList.tsx` — full file, focus on DOM structure
2. `src/features/Chat/hooks/useChatScroll.ts` — verify interface matches consumer
3. `src/features/Chat/Chat.css` — `.chat-sticky-zone` class

Answer these specific questions:
1. Is `spacerRef` div OUTSIDE the sticky zone? (Spacer must not be sticky-pinned.)
2. Is `bottomRef` INSIDE the sticky zone? (Its position signals zone content changes to the ResizeObserver.)
3. When `isPinned` is `false`, does the sticky zone div have ANY effect on layout? (Should be transparent — just a flex container with gap-3, no sticky, no minHeight.)
4. Does the pinned message inside the sticky zone use `skipAnimation={true}`? (Prevents animation blink on mount.)
5. Is the message extracted via `findLastIndex` (or manual reverse loop) rather than `messages[messages.length - 1]`? (The last visible message might be a model message, not user.)
6. Does the `visibleMessages.map()` correctly skip the extracted message index BUT still render its `checkpointsBefore` memory checkpoints?
7. Is the React `key` on the pinned message the same `msg.id` used in the map loop? (Prevents content duplication or lost state.)
8. Does the sticky zone div have `min-height` set to viewport height when pinned? (Prevents spacer background from being visible.)
9. Are the streaming message, ghost message, and confirmation banner JSX bodies unchanged? (Only their container moved — no logic changes inside them.)
10. Does `hook destructuring` use `stickyZoneRef` (not `pinAnchorRef`)?

Fix all findings before moving to Phase 3.

---

## Phase 3: Cleanup + Edge Case Hardening

**Goal:** Remove dead code references, harden edge cases, verify all scroll scenarios work, and add integration-level tests for the complete flow.

### Critical Context

- After Phase 1+2, the core rewrite is done. Phase 3 handles residual cleanup and edge case verification.
- The old pinAnchor pattern may be referenced in other files — grep for `pinAnchor` to find any.
- The `isResizeCompensationRef` mentioned in the original spec does NOT exist in the current codebase — skip.
- Edge cases from the spec that need explicit handling:
  - **Very long user message (taller than viewport):** zone height > viewport height -> spacer = 0 -> OK, user scrolls normally within the sticky zone
  - **Streaming starts without new user message (retry):** P2 catches this (streamingJustStarted + idle -> pinned). But no new user message to pin — sticky zone should show only streaming response. `pinnedMsg` is null. Zone still activates if `isPinned` is set by P2.
  - **Multiple rapid messages:** P1 fires, new message is extracted. P1 fires again before P3 — new message replaces old in sticky zone. Old message returns to map loop. Key reconciliation handles this.
  - **Tool call badges expanding/collapsing:** ResizeObserver on zone catches all height changes.

### Tasks

- [ ] **T3.1** — Grep and fix all references to `pinAnchorRef` outside the rewritten files
  - Search: `grep -r "pinAnchor" src/`
  - Expected: only in the two files we already changed. If found elsewhere, update.

- [ ] **T3.2** — Handle retry scenario (streaming without user message)
  - In `useChatScroll.ts`, P2 branch: when `streamingJustStarted && intentRef.current === 'idle'`:
    ```ts
    setIsPinned(true);
    intentRef.current = 'pinned';
    ```
  - This activates the sticky zone. `pinnedMsg` in ChatMessageList will be `null` (no user message to extract) — the zone shows only the streaming response. ResizeObserver still manages the spacer.
  - ⚠️ If P2 sets `isPinned = true` but there's no user message, the map loop renders all messages normally (no extraction). The sticky zone wraps only the streaming message.

- [ ] **T3.3** — Handle away -> idle transition when user scrolls back to bottom
  - In `handleScroll`, verify the away -> idle transition:
    ```ts
    if (distanceFromBottom <= 80 && intentRef.current === 'away') {
        intentRef.current = 'idle';
        setIsPinned(false);
        setSpacer(0);
    }
    ```
  - Must also `setIsPinned(false)` and `setSpacer(0)` — without this, the sticky zone stays active after user returns to bottom.

- [ ] **T3.4** — Handle P3 residual spacer cleanup
  - When streaming ends (P3) with spacer > 0:
    - Intent stays `pinned`, `isPinned` stays `true`
    - User scrolls down through content — spacer remains
    - When user scrolls past the end of real content into spacer territory, `handleScroll` detects `spacerH > 0 && intent === 'idle'` and collapses
    - But intent is still `pinned`, not `idle`. Need: in `handleScroll`, when pinned and user has scrolled past all content (sticky zone no longer at top):
      ```ts
      if (intentRef.current === 'pinned') {
          const zone = stickyZoneRef.current;
          if (zone) {
              const zoneBottom = zone.getBoundingClientRect().bottom;
              const containerTop = containerRef.current?.getBoundingClientRect().top ?? 0;
              // Zone has scrolled past — user moved beyond pinned area
              if (zoneBottom < containerTop) {
                  intentRef.current = 'away';
              }
          }
      }
      ```
  - Alternative (simpler): when `spacerH <= 0` during pinned scroll, transition to idle. This happens naturally when spacer is consumed. The current handleScroll already has this:
    ```ts
    if (spacerH <= 0 && intentRef.current === 'pinned') {
        intentRef.current = 'idle';
        setIsPinned(false);
    }
    ```
  - ⚠️ Choose the simpler alternative. The `getBoundingClientRect` approach is more precise but adds complexity. The spacer-based transition is sufficient because the spacer IS the mechanism that keeps the sticky zone relevant.

- [ ] **T3.5** — Remove dead `dots` debug category if not used (optional cleanup)
  - This is out of scope. Skip.

- [ ] **T3.6** — Add integration test for pin->stream->unpin cycle
  - File: extend `src/features/Chat/hooks/__tests__/useChatScroll.test.ts`
  - Test scenario: "Full cycle — P1 pin, P2 streaming, P3 unpin"
    1. Initial: `isPinned = false`, intent = idle
    2. Set `messageCount` + 1, `lastMessageRole = 'user'` -> rerender
    3. Assert: `isPinned = true`
    4. Set `isStreaming = true` -> rerender
    5. Assert: `isPinned = true` (stays pinned)
    6. Set `isStreaming = false`, simulate spacer height = 0 -> rerender
    7. Assert: `isPinned = false`, intent = idle
  - Test scenario: "Retry — streaming without new message"
    1. Initial: `isPinned = false`, messageCount = 5
    2. Set `isStreaming = true` (messageCount unchanged) -> rerender
    3. Assert: `isPinned = true` (P2 activates)
    4. Set `isStreaming = false` -> rerender
    5. Assert: `isPinned = false`

- [ ] **T3.7** — Update `docs/features/chat/README.md` if scroll behavior is mentioned
  - Check if the README references scroll behavior, pin-to-top, or wheel events
  - Update any outdated descriptions to reflect sticky-based approach
  - ⚠️ Don't add new sections — only update existing references

### Parallelization plan
```
T3.1 — SEQUENTIAL FIRST (grep + fix references)
T3.2 + T3.3 + T3.4 — PARALLEL subagents (independent edge cases in useChatScroll)
T3.6 — after T3.2-T3.4 (tests for edge cases)
T3.7 — PARALLEL with T3.6 (independent file)
```

### Verification
```bash
cd /Users/muramets/Documents/youtube-interface
npx vitest run --project frontend -- src/features/Chat/hooks/__tests__/useChatScroll.test.ts
npx vitest run --project frontend
npx vitest run --project functions
npm run check
```

### MANDATORY: Update this file before proceeding
- [ ] Mark all T3.x tasks as done
- [ ] Update Phase 3 status to DONE
- [ ] Record test count

---

### Review Gate 3

**Prompt for review agent:**

Read these files:
1. `src/features/Chat/hooks/useChatScroll.ts` — full file (final version)
2. `src/features/Chat/ChatMessageList.tsx` — full file (final version)
3. `src/features/Chat/hooks/__tests__/useChatScroll.test.ts` — all tests
4. `src/features/Chat/Chat.css` — sticky zone class

Then run:
```bash
grep -r "pinAnchor" src/
grep -r "handleWheel" src/
grep -r "preventDefault" src/features/Chat/
grep -r "console\.log" src/features/Chat/hooks/useChatScroll.ts
```

Answer these specific questions:
1. Do ANY references to `pinAnchorRef`, `handleWheel`, `preventDefault`, or `attachWheel` remain in `src/`? (Should be ZERO.)
2. Does `console.log` appear anywhere in `useChatScroll.ts`? (Must be ZERO — only `debug.scroll` allowed.)
3. Does the retry scenario (P2 without new user message) set `isPinned = true`? Does ChatMessageList handle `pinnedMsg = null` gracefully (no crash, no empty div)?
4. When spacer reaches 0 during pinned state, does `handleScroll` set both `intentRef.current = 'idle'` AND `setIsPinned(false)`?
5. When user clicks scrollToBottom, does it reset ALL state? (`isPinned = false`, `intent = idle`, `spacer = 0`, smooth scroll to bottom.)
6. Is the Container ResizeObserver (input height changes) unchanged from the original? (It should survive the rewrite untouched.)
7. Are there edge cases where `isPinned = true` but `intentRef.current !== 'pinned'`? (These should never happen — they must always be in sync.)
8. Does the zone ResizeObserver fire when tool call badges expand during streaming? (It observes the zone div, which contains the streaming message with badges.)
9. Is the test coverage proportional? At minimum: P1, P2, P3, P4, scrollToBottom, FAB, retry scenario.
10. Total line count of `useChatScroll.ts` — is it under ~180 lines? (Was 443, target ~150.)

Fix all findings before moving to FINAL phase.

---

## FINAL Phase: Double Review-Fix Cycle

### R1: Architecture Review

**Prompt for review agent:**

Read ALL files modified across all phases:
1. `src/features/Chat/hooks/useChatScroll.ts` — rewritten hook
2. `src/features/Chat/ChatMessageList.tsx` — DOM restructure
3. `src/features/Chat/Chat.css` — new `.chat-sticky-zone` class
4. `src/features/Chat/hooks/__tests__/useChatScroll.test.ts` — tests
5. `src/core/utils/debug.ts` — verify scroll category usage

Answer these architecture questions:
1. **Consistency:** Are `isPinned` (React state, drives CSS) and `intentRef.current` (ref, drives logic) always in sync? Map out all transitions: idle->pinned, pinned->idle, pinned->away, away->idle. Does each one set BOTH?
2. **SRP:** Does `useChatScroll` still have a single responsibility (scroll state management)? Or has sticky zone management (ResizeObserver, spacer sizing) bloated it? Should the zone observer be a separate hook?
3. **Separation of concerns:** Is the message extraction logic (`pinnedMsgIndex`, `pinnedMsg`) in the right place? It's in `ChatMessageList.tsx` (presentation) — is it presentation logic or scroll logic? (It should be in the component, not the hook — the hook doesn't know about messages.)
4. **Shared utilities:** Is there any code duplicated between the zone ResizeObserver and the container ResizeObserver? Can they be consolidated?
5. **React performance:** Does the `isPinned` state change cause expensive re-renders? (It causes the full `visibleMessages.map()` to re-render because `pinnedMsgIndex` changes.) Is this acceptable? (Yes — the map is already re-rendered on every message/streaming tick.)
6. **Ref vs State:** Is `isPinned` correctly a state (not a ref)? It drives CSS class changes and JSX conditional rendering — must be state. `intentRef` stays a ref because it's read in event handlers (not used for rendering).
7. **Feature doc:** Should a feature doc be created for this, or is this task doc + code comments sufficient? (Infrastructure refactor — task doc is sufficient.)
8. **CSS specificity:** Does `.chat-sticky-zone` conflict with `.chat-messages` styles? Specifically `overflow-anchor: auto` on messages vs `overflow-anchor: none` on zone.

### R2: Production Readiness Review

**Prompt for review agent:**

Read the same files as R1, plus:
- `docs/features/chat/infrastructure/chat-resilience.md` (related feature doc)
- The git diff of all changes (use `git diff` if available)

Answer these production questions:
1. **Memory leak:** Is the zone ResizeObserver properly disconnected on unmount? Does it handle `stickyZoneRef.current` being null gracefully?
2. **Race condition:** Can `setIsPinned(true)` fire on one render, and the ResizeObserver callback fire before the sticky zone div exists in the DOM? (React batches state updates — the div should exist on the same render that sets isPinned.)
3. **Performance:** How many ResizeObserver callbacks fire during a typical streaming session? (Roughly 1 per streaming text chunk, debounced by the browser's frame rate.) Is this acceptable? (Yes — each callback is ~5 lines of math, no DOM reads beyond 2 properties.)
4. **Browser compatibility:** Is `position: sticky` supported in all target browsers? (Yes — 97%+ global support, all modern browsers including Safari 13+.)
5. **Accessibility:** Does the DOM restructure break any ARIA landmarks or tab order? (The pinned message moves in the DOM — screen readers will encounter it in a different order when pinned vs unpinned.)
6. **Visual regression:** When `isPinned` toggles, is there any visible jump? (The message moves from map position to sticky zone — same visual position because sticky pins it to top. But the transition from unpinned to pinned might cause a 1-frame layout shift. Test in browser.)
7. **Scroll position preservation:** When streaming ends (P3) and `isPinned` becomes `false`, does the scroll position jump? (If spacer is 0, the message flows back into the map loop at the same position. If spacer > 0, the spacer maintains the position until user scrolls.)
8. **Error resilience:** If `stickyZoneRef.current` is null when ResizeObserver fires (unlikely but possible during unmount), does the code handle it? (The observer callback should early-return if refs are null.)
9. **Test coverage:** Are all edge cases from the spec covered? Very long user message, multiple rapid messages, tool badge expansion, message reconciliation, retry without user message.
10. **Dead code:** Is there any remaining code from the old implementation that's no longer used? Search for: `pinnedMax`, `elastic`, `consumption`, `prevScrollTop`, `wheelAttached`, `scrollEnd`.

### Verification (FINAL)
```bash
cd /Users/muramets/Documents/youtube-interface
npx vitest run --project frontend
npx vitest run --project functions
npm run check
```

### MANDATORY: Update this file after FINAL
- [ ] Mark FINAL phase as DONE
- [ ] Record final test count
- [ ] Update `docs/features/chat/README.md` if scroll behavior is mentioned
- [ ] Confirm no references to old scroll pattern remain in `src/`
