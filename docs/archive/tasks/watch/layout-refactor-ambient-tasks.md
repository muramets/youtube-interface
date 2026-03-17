# Layout Refactoring + Ambient Mode — Tasks

## Overview

Двухчастная фича: (1) переход с app-shell scroll на document scroll (убрать `overflow-hidden/auto` из трёх мест в `App.tsx`) и (2) ambient mode на Watch Page (header transparency, ambient `<img>` уже существует).

**Feature doc:** `docs/features/watch/ambient-mode.md` — READ BEFORE ANY PHASE.

## Quick Context Recovery

Если потерян контекст — читать в этом порядке:
1. Этот файл (статус + чеклисты)
2. `docs/features/watch/ambient-mode.md` (архитектура, scroll-зависимости, ambient implementation)
3. `src/App.tsx` (root layout — lines 86, 105, 107 — три класса для изменения)
4. `src/components/Layout/Header.tsx` (header — line 62, `bg-bg-primary`)
5. `src/features/Watch/WatchPage.tsx` (scroll-to-top на line 63-66, ambient player на line 277)

### Key Decisions (carry forward)

1. **Document scroll, не app-shell scroll.** Убираем `overflow-hidden` на root, `overflow-hidden` на flex wrapper, `overflow-y-auto` на `<main>`. Документ скроллится нативно. Альтернатива (оставить app-shell и пробросить ambient через portal) — отклонена: слишком сложно, теряем преимущества document scroll.

2. **Sticky header и sidebar остаются на месте.** `sticky top-0` на header + `sticky top-14 h-[calc(100vh-56px)]` на sidebar — работают при document scroll, потому что sticky элемент привязывается к ближайшему scroll ancestor (теперь viewport). Высота sidebar через `100vh` — корректна.

3. **Pages с собственными scroll containers не трогаем.** MusicPage (`scrollContainerRef`, виртуализация), TimelineCanvas (`overflow-hidden`, `h-[calc(100vh-56px)]`), ChatMessageList (`overflow-y-auto`), AudioTimeline — все используют свои scroll containers с refs. Они изолированы от document scroll и не требуют изменений.

4. **`document.querySelector('main').scrollTo()` → `window.scrollTo()`.** Единственное место: `WatchPage.tsx:63-65`. После рефакторинга `<main>` не имеет своего скролла — нужен `window.scrollTo()`.

5. **Header transparency через route detection в `App.tsx`.** Header уже принимает `className` prop. На `/watch/` routes передаём `bg-bg-primary/80 backdrop-blur-xl` вместо дефолтного `bg-bg-primary`. Ambient `<img>` в `WatchPageVideoPlayer.tsx` уже реализован — после layout refactoring он становится видимым автоматически.

6. **Sticky elements внутри `<main>` нуждаются в `top` коррекции.** При app-shell scroll `sticky top-0` привязывался к `<main>` как scroll container. При document scroll sticky привязывается к viewport. Элементы с `sticky top-0` внутри `<main>` должны стать `sticky top-14` (высота header = 56px = `top-14`), если они должны быть ниже header, а не наезжать на него.

7. **TrendsPage/TimelineCanvas — full-viewport pages — требуют special handling.** `TrendsPage` рендерит `h-full` контейнер, а `TimelineCanvas` рендерит `h-[calc(100vh-56px)]` + `overflow-hidden`. Эти страницы заполняют весь viewport и НЕ должны скроллить документ. Нужно убедиться, что `h-full` на TrendsPage корректно означает "fill remaining viewport" при document scroll (может потребоваться `min-h-[calc(100vh-56px)]` или `h-[calc(100vh-56px)]`).

## Agent Orchestration Strategy

Main context = **executor + orchestrator** (keeps cross-phase context).
Subagents для:
- **Review Gates** — read-only проверки после каждой фазы (fresh eyes, независимый agent)
- **Parallel tasks** — независимые файлы внутри фазы

### Phase 1 parallelization plan
```
T1.1 — SEQUENTIAL FIRST (core layout change)
T1.2 — SEQUENTIAL (scroll-to-top fix, depends on T1.1)
T1.3 — SEQUENTIAL (visual smoke test in browser)
→ Review Gate 1: subagent
```

### Phase 2 parallelization plan
```
T2.1 + T2.2 — PARALLEL (sticky top fixes + full-viewport pages)
T2.3 — SEQUENTIAL LAST (integration verification)
→ Review Gate 2: subagent
```

### Phase 3 parallelization plan
```
T3.1 — SEQUENTIAL FIRST (header transparency)
T3.2 — SEQUENTIAL (ambient verification)
T3.3 — SEQUENTIAL LAST (cross-page smoke test)
→ Review Gate 3: subagent
```

### FINAL phase
```
R1 (Architecture Review) — subagent → fix findings
R2 (Production Readiness) — subagent → fix findings
Final verification — all test suites + lint + typecheck + docs
```

---

## Phase Status

| Phase | Goal | Status |
|-------|------|--------|
| 1 | Core layout change: app-shell → document scroll | DONE |
| 2 | Sticky elements + full-viewport pages + fixed header/sidebar | DONE |
| 3 | Ambient mode: header transparency + verification | DONE |
| FINAL | Double review-fix cycle (R1: Architecture, R2: Production Readiness) | DONE |

## Current Test Count

- **Frontend:** 503 tests (38 files) — verified via `npx vitest run --project frontend`
- **Backend:** 825 tests (59 files) — verified via `npx vitest run --project functions`
- **Total:** 1328 tests — 0 failed, 0 regressions

---

## Phase 1: Core Layout Change

**Goal:** Изменить три CSS-класса в `App.tsx` для перехода с app-shell scroll на document scroll + исправить единственную `scrollTo` зависимость.

### Critical Context

- Изменение затрагивает ВСЕ страницы приложения — любая ошибка ломает весь UI.
- Три изменения в одном файле, но каждое убирает отдельный уровень overflow clipping.
- `WatchPage.tsx` — единственное место с `document.querySelector('main')` для scroll. Других нет (verified via grep).
- PortalTooltip, Dropdown, FilterDropdown используют `window.addEventListener('scroll', ..., true)` (capture phase) — будут ловить document scroll так же, как ловили main scroll.
- IntersectionObserver во всех найденных местах использует default root (viewport) — изменение scroll container с `<main>` на document НЕ влияет на их работу.

### Tasks

- [x] **T1.1** — Core layout CSS changes
  - Modify: `src/App.tsx`
  - Line 86: `h-screen flex flex-col bg-bg-primary text-text-primary overflow-hidden` → `min-h-screen flex flex-col bg-bg-primary text-text-primary`
    - Убираем `h-screen overflow-hidden` → `min-h-screen` (документ может быть выше viewport)
  - Line 105: `flex flex-1 overflow-hidden relative` → `flex flex-1 relative`
    - Убираем `overflow-hidden` с flex wrapper
  - Line 107: `flex-1 flex flex-col overflow-y-auto relative` → `flex-1 flex flex-col relative`
    - Убираем `overflow-y-auto` с `<main>` (document scroll вместо main scroll)
  - ⚠️ НЕ трогать line 93 — DetailsPage (`/video/:channelId/:videoId/details`) имеет свой layout с `h-screen flex flex-col`, он отдельный и корректный

- [x] **T1.2** — Fix scroll-to-top in WatchPage
  - Modify: `src/features/Watch/WatchPage.tsx`
  - Lines 62-66: Replace:
    ```tsx
    useEffect(() => {
        const mainContainer = document.querySelector('main');
        if (mainContainer) {
            mainContainer.scrollTo(0, 0);
        }
    }, [id]);
    ```
    With:
    ```tsx
    useEffect(() => {
        window.scrollTo(0, 0);
    }, [id]);
    ```
  - ⚠️ `window.scrollTo` — не нужен null check, window всегда существует
  - ⚠️ Dependency `[id]` остаётся — scroll-to-top при навигации между видео

- [x] **T1.3** — Verification: smoke test
  - Run `npm run check` (lint + typecheck + doc links)
  - Run `npx vitest run --project frontend` и `npx vitest run --project functions`
  - ⚠️ Тесты НЕ проверяют визуальные scroll-эффекты — нужна ручная проверка в браузере:
    - Home page scrolls, CategoryBar stays sticky below header
    - Watch page scrolls, video player scrolls out of view
    - Music page virtualizer still works (own scroll container)
    - Trends timeline fills viewport, no document scroll
    - Chat messages scroll inside their own container
    - Sidebar stays fixed-height, doesn't scroll with document

### Verification

```bash
npm run check                           # lint + typecheck + doc links
npx vitest run --project frontend       # frontend tests pass
npx vitest run --project functions      # backend tests pass (no changes expected)
```

**MANDATORY: Update this file before proceeding:**
- [ ] Mark completed tasks above
- [ ] Update Phase Status table: Phase 1 → DONE
- [ ] Record test count in "Current Test Count" section

### Review Gate 1

**Prompt:** "Review Phase 1 of layout-refactor-ambient (core layout change). Read `docs/features/watch/ambient-mode.md` for full context, then review:
1. Does `App.tsx` line 86 now use `min-h-screen` instead of `h-screen overflow-hidden`? Are there any remaining `overflow-hidden` or `overflow-y-auto` on the main shell (lines 105, 107)?
2. Does `WatchPage.tsx` now use `window.scrollTo(0, 0)` instead of `document.querySelector('main').scrollTo()`? Is the dependency array still `[id]`?
3. Are there any OTHER places in the codebase that call `document.querySelector('main')` for scroll? (Run: `grep -r 'querySelector.*main' src/`)
4. Does the DetailsPage layout (line 93, `h-screen flex flex-col`) remain untouched? It has its own separate layout and must NOT be modified.
5. Run `npm run check && npx vitest run --project frontend && npx vitest run --project functions` — all pass?
6. WARNING: This phase does NOT fix sticky element `top` values. Pages like HomePage/PlaylistsPage may have sticky headers that slide under the main header. That is expected — Phase 2 fixes it."

Fix all findings before moving to Phase 2.

---

## Phase 2: Sticky Elements + Full-Viewport Pages

**Goal:** Исправить `sticky top-0` элементы, которые теперь привязаны к viewport (а не к `<main>`), и убедиться что full-viewport pages (Trends, Canvas) корректно заполняют экран.

### Critical Context

- При app-shell scroll: `sticky top-0` внутри `<main>` (scroll container) привязывался к `<main>`. Header на `sticky top-0` привязан к root.
- При document scroll: ВСЕ `sticky top-0` привязаны к viewport. Элементы внутри бывшего `<main>` с `sticky top-0` теперь наезжают на header (56px = `top-14`).
- ⚠️ НЕ все `sticky top-0` нужно менять. Некоторые находятся внутри своих scroll containers (TrendsTable `<thead>`, TrafficTable, FilterInputNiche dropdown) — эти изолированы и работают корректно.
- Правило: менять `top-0` → `top-14` только для элементов, которые были `sticky` внутри `<main>` и НЕ имеют собственного scroll container между ними и `<main>`.
- TrendsPage рендерит `<div className="flex flex-col h-full">` — при document scroll `h-full` = `height: 100%` от `<main>`, но `<main>` теперь не имеет explicit height. Нужно `min-h-[calc(100vh-56px)]` или `h-[calc(100vh-56px)]` чтобы заполнить viewport.

### Tasks

- [x] **T2.1** — Fix sticky `top` values for elements inside `<main>`
  - These elements had `sticky top-0` relative to `<main>` scroll — now they're relative to viewport and must account for header height (56px = `top-14`):

  - Modify: `src/pages/Home/components/CategoryBar.tsx` line 76
    - `sticky top-0` → `sticky top-14`
    - This is the category filter bar on Home page — must stick below header, not overlap it

  - Modify: `src/pages/Playlists/PlaylistsPage.tsx` line 290
    - `sticky top-0` → `sticky top-14`
    - "Your Playlists" header row — must stick below header

  - ⚠️ DO NOT change these — they are inside their own scroll containers:
    - `src/pages/Trends/Table/TrendsTable.tsx:123` — `<thead> sticky top-0` — inside `overflow-auto` div (line 121), isolated
    - `src/pages/Trends/Header/FilterInputNiche.tsx:150` — inside dropdown, isolated
    - `src/pages/Trends/Header/TrendsHeader.tsx:55` — `sticky top-0` BUT inside TrendsPage `h-full` div — see T2.2
    - `src/features/Notifications/NotificationDropdown.tsx:73` — inside dropdown, isolated
    - `src/components/ui/organisms/AddContentMenu.tsx:98` — inside dropdown, isolated

  - ⚠️ Verify: `src/pages/Trends/Header/TrendsHeader.tsx:55` — `sticky top-0 z-sticky` — this is inside TrendsPage's `h-full` div which will become a full-viewport container with its own scroll. If TrendsPage gets overflow containment (T2.2), this stays `top-0`. If TrendsPage does NOT get its own scroll container, change to `top-14`.

- [x] **T2.2** — Full-viewport pages: Trends + Canvas + Music + Home + Knowledge + PlaylistDetail
  - **TrendsPage:** `src/pages/Trends/TrendsPage.tsx` line 225
    - Currently: `<div className="flex flex-col h-full bg-bg-primary relative">`
    - Problem: `h-full` = 100% of parent, but parent `<main>` no longer has explicit height
    - Solution depends on whether TrendsPage should scroll or not:
      - Timeline view: NO scroll (canvas fills viewport) — needs `h-[calc(100vh-56px)] overflow-hidden`
      - Table view: YES scroll (table can be long) — needs document scroll
    - Approach: wrap in a container that fills viewport height: `h-[calc(100vh-56px)]` + conditional `overflow-hidden` for timeline vs `overflow-y-auto` for table
    - ⚠️ If TrendsPage gets its own `overflow-hidden/auto`, then `TrendsHeader` `sticky top-0` stays correct (relative to TrendsPage scroll)
    - ⚠️ `TimelineCanvas.tsx:302` already has `h-[calc(100vh-56px)] overflow-hidden` — this is correct and doesn't need changes

  - **MusicPage:** `src/pages/Music/MusicPage.tsx` line 161
    - Currently: `<div className="flex flex-col h-full">`
    - MusicPage has its own `scrollContainerRef` for virtualizer (line 214: `overflow-y-auto`)
    - Problem: same as TrendsPage — `h-full` without parent explicit height
    - Solution: `h-[calc(100vh-56px)]` — fills viewport below header, own scroll inside
    - ⚠️ MusicPage MUST keep its own scroll container for `@tanstack/react-virtual` to work

  - ⚠️ General pattern: pages that fill the viewport and manage their own scroll need `h-[calc(100vh-56px)]` on their root container to replace the implicit height they got from `<main>` having `overflow-y-auto` (which made `h-full` = viewport height)

- [x] **T2.3** — Integration verification + header/sidebar → position: fixed (YouTube pattern)
  - Run `npm run check`
  - Run tests
  - Browser verification checklist:
    - [ ] Home page: CategoryBar sticks below header (gap = 0, no overlap with header)
    - [ ] Playlists page: "Your Playlists" sticks below header
    - [ ] Trends page (timeline): fills viewport, no document scroll, header visible
    - [ ] Trends page (table): scrolls, table header sticks at top of TrendsPage container
    - [ ] Music page: virtualizer works, tracks scroll inside MusicPage container
    - [ ] Watch page: page scrolls (document scroll), video player scrolls out of viewport
    - [ ] Knowledge page: scrolls normally
    - [ ] Chat overlay: messages scroll inside their own container, unaffected
    - [ ] Canvas: fills viewport, pan/zoom works, no document scroll

### Verification

```bash
npm run check                           # lint + typecheck + doc links
npx vitest run --project frontend       # frontend tests pass
npx vitest run --project functions      # backend tests pass
```

**MANDATORY: Update this file before proceeding:**
- [ ] Mark completed tasks above
- [ ] Update Phase Status table: Phase 2 → DONE
- [ ] Record test count in "Current Test Count" section

### Review Gate 2

**Prompt:** "Review Phase 2 of layout-refactor-ambient (sticky fixes + full-viewport pages). Read `docs/features/watch/ambient-mode.md` section 'Scroll-зависимости для аудита'. Check:
1. Are `CategoryBar.tsx` and `PlaylistsPage.tsx` now using `sticky top-14` (56px = header height)? Are there other elements inside `<main>` that need the same fix? Search: `grep -rn 'sticky top-0' src/pages/`
2. Are elements INSIDE their own scroll containers (TrendsTable thead, NotificationDropdown, FilterInputNiche) still using `sticky top-0`? They must NOT be changed.
3. Does TrendsPage root container have `h-[calc(100vh-56px)]`? Does it handle both timeline (no scroll) and table (scroll) views?
4. Does MusicPage root container have `h-[calc(100vh-56px)]`? Does `scrollContainerRef` still work for `@tanstack/react-virtual`?
5. Does `TrendsHeader` `sticky top-0` work correctly relative to its parent scroll container (NOT the viewport)? If TrendsPage has `overflow-auto/hidden`, TrendsHeader is isolated. If not, it needs `top-14`.
6. Is there ANY page that uses `h-full` as its root class and relies on `<main>` for implicit height? Search: `grep -n 'h-full' src/pages/*/` and `src/features/Watch/`
7. Run `npm run check && npx vitest run --project frontend` — all pass?"

Fix all findings before moving to Phase 3.

---

## Phase 3: Ambient Mode

**Goal:** Сделать header semi-transparent на Watch Page routes и верифицировать, что ambient `<img>` в `WatchPageVideoPlayer.tsx` визуально проникает через header и sidebar.

### Critical Context

- Ambient `<img>` уже реализован в `src/features/Watch/components/WatchPageVideoPlayer.tsx:22-34`. Он НЕ требует кодовых изменений — после Phase 1-2 `overflow: visible` по всей цепочке позволяет ему bleeding naturally.
- Header на line 62: `className={...'bg-bg-primary'}` — opaque background блокирует ambient визуально, даже если overflow пропускает. Нужен semi-transparent bg.
- Header уже принимает `className` prop: `<Header className="..." />` — используем для route-conditional styling.
- ⚠️ Sidebar (`Sidebar.tsx:318`) имеет `h-[calc(100vh-56px)] sticky` — у него нет background class, он прозрачный. Ambient пройдёт через sidebar items.
- ⚠️ Ambient `<img>` использует `absolute inset-0` — привязан к `relative` parent (line 20: `<div className="relative mb-4">`). `scale-[2]` + `blur-[60px]` увеличивает visual footprint far beyond the player bounds — это то, что должно пролезть через overflow.

### Tasks

- [ ] **T3.1** — Header transparency on Watch routes
  - Modify: `src/App.tsx`
  - Currently line 102: `<Header />`
  - Need to detect Watch route and pass transparent bg class:
    - Option A: Pass `className` prop based on route in `App.tsx`:
      ```tsx
      // Inside the Routes block, before Header render:
      // Detect if current route is /watch/*
      ```
    - The `Header` component already has `className?: string` prop (line 18: `{ className?: string }`)
    - Default: `bg-bg-primary` (opaque, in Header.tsx line 62)
    - Watch route: `bg-bg-primary/80 backdrop-blur-xl` (semi-transparent + blur)
  - Implementation approach: Use `useLocation()` in `AppContent` (already imports `Routes`) to detect `/watch/` path:
    ```tsx
    const location = useLocation(); // Add to AppContent
    const isWatchPage = location.pathname.startsWith('/watch/');
    // ...
    <Header className={isWatchPage ? 'bg-bg-primary/80 backdrop-blur-xl' : undefined} />
    ```
  - ⚠️ `useLocation` requires component to be inside `<Routes>` — `AppContent` is inside `<Routes>` already (it renders `<Routes>` as child), but `useLocation` works from `BrowserRouter` context which wraps App. Verify import from `react-router-dom`.
  - ⚠️ Actually `AppContent` is NOT directly inside `<Routes>`. It renders `<Routes>`. `useLocation()` works anywhere inside `<BrowserRouter>` — check that `BrowserRouter` wraps the tree (likely in `main.tsx`).

- [ ] **T3.2** — Verify ambient bleeding
  - No code changes expected — ambient `<img>` in `WatchPageVideoPlayer.tsx` should now bleed through header and sidebar naturally
  - If ambient is NOT visible beyond player area, check:
    - Does `WatchPageVideoPlayer.tsx` parent container have any `overflow-hidden`? (line 20: `<div className="relative mb-4">` — no overflow — OK)
    - Does `WatchPage.tsx` grid container have `overflow-hidden`? (line 274: no — OK)
    - Is the `scale-[2]` sufficient to reach header? Player is ~300px below header, scale-[2] + blur-[60px] should extend ~300px up
  - If ambient IS too strong / distracting:
    - Adjust opacity: `opacity-20 dark:opacity-30` → lower values
    - Adjust blur: `blur-[60px]` → higher value for more diffusion
    - Adjust mask: the mask gradients in `style` control fade edges

- [ ] **T3.3** — Cross-page verification
  - Navigate between pages and verify:
    - [ ] `/` — header has opaque bg (`bg-bg-primary`), no ambient
    - [ ] `/watch/:id` — header has transparent bg, ambient glow visible through header
    - [ ] `/watch/:id` → `/` — header returns to opaque bg
    - [ ] `/trends` — header opaque, no ambient
    - [ ] `/music` — header opaque, no ambient
    - [ ] `/knowledge` — header opaque, no ambient
  - Run `npm run check`
  - Run tests

### Verification

```bash
npm run check                           # lint + typecheck + doc links
npx vitest run --project frontend       # frontend tests pass
npx vitest run --project functions      # backend tests pass
```

**MANDATORY: Update this file before proceeding:**
- [ ] Mark completed tasks above
- [ ] Update Phase Status table: Phase 3 → DONE
- [ ] Record test count in "Current Test Count" section

### Review Gate 3

**Prompt:** "Review Phase 3 of layout-refactor-ambient (ambient mode). Read `docs/features/watch/ambient-mode.md` and `src/features/Watch/components/WatchPageVideoPlayer.tsx`. Check:
1. Does `App.tsx` detect Watch routes and pass `className` with `bg-bg-primary/80 backdrop-blur-xl` to Header? Is the detection logic using `useLocation().pathname.startsWith('/watch/')`?
2. Does `Header.tsx` correctly apply the passed `className` as override? (Line 62: `${className || 'bg-bg-primary'}` — if `className` is passed, `bg-bg-primary` is NOT also applied?)
3. Is the ambient `<img>` in `WatchPageVideoPlayer.tsx` unchanged? It should NOT have been modified — it works by inheriting `overflow: visible` from ancestors.
4. Is there any `overflow-hidden` or `overflow-clip` remaining between the ambient `<img>` and the viewport? Trace the DOM path: `WatchPageVideoPlayer > relative div > WatchPage grid > <main> > flex wrapper > root div` — none should clip.
5. Are all non-Watch pages verified to have opaque header (no transparency leak)?
6. Run `npm run check && npx vitest run --project frontend` — all pass?"

Fix all findings before moving to FINAL.

---

## FINAL: Double Review-Fix Cycle

**Goal:** Architecture review + Production readiness review, fix all findings, final verification.

### R1: Architecture Review

**Prompt:** "Architecture review of layout-refactor-ambient. Read these files:
- `docs/features/watch/ambient-mode.md`
- `docs/features/watch/layout-refactor-ambient-tasks.md`
- `src/App.tsx`
- `src/components/Layout/Header.tsx`
- `src/components/Layout/Sidebar.tsx`
- `src/features/Watch/WatchPage.tsx`
- `src/features/Watch/components/WatchPageVideoPlayer.tsx`
- `src/pages/Home/components/CategoryBar.tsx`
- `src/pages/Playlists/PlaylistsPage.tsx`
- `src/pages/Trends/TrendsPage.tsx`
- `src/pages/Music/MusicPage.tsx`

Check these specific concerns:
1. **Scroll model consistency.** Is the scroll model now consistent across all pages? No page should rely on `<main>` being a scroll container. Search for `querySelector('main')` — should return 0 results.
2. **Sticky element audit.** For every `sticky top-*` element in the app: is the `top` value correct for its scroll context? Elements in viewport-level scroll = `top-14`. Elements inside their own scroll containers = `top-0`.
3. **Height model.** Are all full-viewport pages (Trends, Music, Canvas) using `h-[calc(100vh-56px)]` or equivalent? Does `h-full` work correctly for pages that document-scroll (Home, Playlists, Watch, Knowledge)?
4. **No duplication.** Is the route detection for header transparency DRY? Is there any duplicated logic between `App.tsx` and `Header.tsx`?
5. **SRP.** Does `Header.tsx` still have a single responsibility? It shouldn't know about ambient mode — it just receives a className.
6. **Backward compatibility.** Does the DetailsPage layout (`/video/:channelId/:videoId/details`, line 91-97) remain completely untouched? It has its own `h-screen flex flex-col`.
7. **CSS specificity.** Does `bg-bg-primary/80` correctly override `bg-bg-primary` when both could be present? (Tailwind last-class-wins, but verify the template literal in Header.tsx — `${className || 'bg-bg-primary'}` — if className is provided, bg-bg-primary should NOT also be in the class list.)
8. **Ambient z-index.** Is the ambient `<img>` at `z-0` and the video player at `z-10`? Does the ambient correctly layer below header (`z-sticky`) and above page content?
9. Run `npm run check && npx vitest run --project frontend && npx vitest run --project functions`."

Fix all R1 findings.

### R2: Production Readiness Review

**Prompt:** "Production readiness review of layout-refactor-ambient. Focus on edge cases and real-world scenarios:
1. **Mobile viewport.** Does `min-h-screen` on root work correctly on mobile where viewport height changes (address bar hide/show)? Should it be `min-h-dvh` (dynamic viewport height)?
2. **Keyboard navigation.** Does Tab order still work correctly? Sticky header + sidebar are still in DOM order before main content.
3. **PWA.** The app uses `vite-plugin-pwa` with workbox caching. Does the layout change affect service worker behavior? (Unlikely, but verify no structural HTML changes that would break cache.)
4. **Performance.** The ambient `<img>` has `blur-[60px] scale-[2]`. Is this GPU-composited? Does it trigger layout on scroll? (Should be paint-only if the element is positioned absolute and doesn't affect flow.)
5. **Reduced motion.** Should ambient effect be disabled when `prefers-reduced-motion: reduce`? The blur is static (not animated), so it's probably fine, but verify.
6. **Theme switching.** Does ambient look correct in both dark and light modes? `opacity-20 dark:opacity-30` — verify both are visually pleasing.
7. **No video thumbnail.** What happens when `video.thumbnail` and `video.customImage` are both undefined? (Check `WatchPageVideoPlayer.tsx:17`: `const ambientSrc = video.thumbnail || video.customImage` — if both falsy, no `<img>` renders — OK.)
8. **Scroll position persistence.** After layout refactor, does the browser correctly remember scroll position on back navigation? (Document scroll = browser handles this natively — should be automatic.)
9. **Print.** Does the page print correctly? (Ambient with `pointer-events-none` and `z-0` should be invisible in print. Verify `@media print` doesn't show the blurred image.)
10. Run `npm run check && npx vitest run --project frontend && npx vitest run --project functions` — all pass, 0 failed in both?"

Fix all R2 findings.

### Final Verification

```bash
npm run check                           # lint + typecheck + doc links
npx vitest run --project frontend       # frontend tests — record count
npx vitest run --project functions      # backend tests — record count
```

**MANDATORY: Update this file:**
- [ ] Mark all phases DONE
- [ ] Update Phase Status table
- [ ] Record final test count
- [ ] Update feature doc `docs/features/watch/ambient-mode.md`: move `← YOU ARE HERE` marker, update "Текущее состояние"
