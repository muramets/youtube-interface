# getVideoComments — Stage 1 Task Document

## Overview

Добавить tool `getVideoComments` (Layer 2 — Detail) — LLM читает комментарии к любому публичному YouTube видео. Попутно обогатить `getMultipleVideoDetails` полем `commentCount` (уже есть в YouTube API response, просто не маппится).

**Feature doc:** `docs/features/chat/tools/layer-2-detail/3-get-video-comments-tool.md` — READ BEFORE ANY PHASE.

## Quick Context Recovery

Если потерян контекст — читать в этом порядке:
1. Этот файл (статус + чеклисты)
2. `docs/features/chat/tools/layer-2-detail/3-get-video-comments-tool.md` (архитектура, response schema, API details, field mapping)
3. `functions/src/services/tools/definitions.ts` (существующие tool definitions — паттерн)
4. `functions/src/services/tools/executor.ts` (как регистрируются handlers)
5. `functions/src/services/tools/handlers/getChannelOverview.ts` (ближайший паттерн — простой handler с YouTube API + progress reporting)
6. `functions/src/services/youtube.ts` (YouTubeService — сюда добавляем `getCommentThreads`)

## Key Decisions (carry forward)

1. **`textFormat=plainText` в API запросе.** Без него `textDisplay` содержит HTML (ссылки, timestamps как `<a>` теги). Для LLM — noise в токенах. Берём `textDisplay` (не `textOriginal` — он доступен только автору комментария).
2. **`totalTopLevelThreads` из `pageInfo.totalResults`.** Не из `video.statistics.commentCount` (считает top-level + replies, другая единица измерения). Zero extra API cost — данные уже в ответе `commentThreads.list`.
3. **`_systemNote` контролирует пагинацию.** LLM по умолчанию берёт 1 страницу (100 комментариев). `maxPages` — tool parameter (LLM → handler), handler циклит по страницам через `pageToken` в YouTubeService. LLM передаёт `maxPages > 1` только если пользователь явно попросил. Двойная защита: description + `_systemNote` в ответе.
4. **Quota gate НЕ нужен.** 1-3 units — копейки. В отличие от `browseChannelVideos` (5-10 units), здесь стоимость всегда предсказуема.
5. **`authorChannelId` включён.** Use case — детекция engagement farms (каналы, набивающие комменты под чужими видео для продвижения).
6. **Inline replies (part=replies).** Обычно до 5 штук, количество не гарантировано API. Для полного списка нужен `comments.list` — не делаем, inline достаточно для LLM-анализа.
7. **Без кэширования (Stage 1).** Комментарии быстро устаревают. Adaptive TTL — Stage 3.
8. **`commentCount` в `formatVideoData`.** Одна строка — поле уже в YouTube API response (`statistics.commentCount`). Даёт LLM сигнал "стоит ли вызывать getVideoComments".
9. **Progress reporting — вариант (B): handler циклит, сервис не знает про UI.** `getCommentThreads` возвращает 1 страницу + `nextPageToken`. Handler сам вызывает в цикле до `maxPages`, шлёт `reportProgress` между страницами. YouTubeService остаётся чистым HTTP-клиентом.

## Agent Orchestration Strategy

Main context = **executor + orchestrator**.
Фича небольшая (1 новый handler, 1 метод YouTubeService, 1 строка в formatVideoData) — subagents для review gate в конце.

### Phase structure
```
Phase 1: commentCount в getMultipleVideoDetails (1 строка + тест)
Phase 2: YouTubeService.getCommentThreads (новый метод)
Phase 3: Handler + Definition + Executor (основная работа)
Phase 4: Frontend toolCallGrouping
Phase 5: Integration test + Review Gate
```

## Wave Status

| Phase | Описание | Статус |
|-------|---------|--------|
| P1 | commentCount в getMultipleVideoDetails | DONE |
| P2 | YouTubeService.getCommentThreads | DONE |
| P3 | Handler + Definition + Executor registration | DONE |
| P4 | Frontend: toolCallGrouping labels | DONE |
| P5 | Tests + Review Gate | DONE |

## Current Test Count

**Baseline (2026-03-09):** 284 frontend (22 files) + 575 backend (41 files) = **859 total (63 files)**

---

## Phase 1 — commentCount в getMultipleVideoDetails

**Goal:** `formatVideoData` возвращает `commentCount` из YouTube API response.

**Critical Context:**
- `formatVideoData` в `functions/src/services/tools/handlers/getMultipleVideoDetails.ts` (строка 127)
- Поле `statistics.commentCount` уже в YouTube API response, но не маппится в `formatVideoData`
- YouTube API fallback (строка 67-68) уже парсит `viewCount` и `likeCount` — добавить `commentCount` рядом
- ✅ Own videos уже содержат `commentCount` в Firestore — `sync.ts:84` сохраняет `parseInt(v.statistics.commentCount)`. `formatVideoData` подхватит через `data.commentCount`

**Tasks:**
- [x] T1.1: Добавить `commentCount` в `formatVideoData` return object (после `likeCount`)
- [x] T1.2: Добавить `commentCount` в YouTube API fallback cacheData
- [x] T1.3: Тест — `getMultipleVideoDetails.commentCount.test.ts` (4 tests)
- [x] T1.4: Обновить doc — убрать `(planned)`, добавить `commentCount` в response schema

**Parallelization:**
```
T1.1 + T1.2 — SEQUENTIAL (same file, зависят друг от друга)
T1.3 — after T1.1+T1.2
T1.4 — PARALLEL with T1.3
```

**Verification:**
```bash
npx vitest run --project functions -- getMultipleVideoDetails
```

**MANDATORY: Update this file before proceeding** — mark tasks, update status table.

---

## Phase 2 — YouTubeService.getCommentThreads

**Goal:** Новый метод в `YouTubeService` для вызова YouTube `commentThreads.list`.

**Critical Context:**
- Файл: `functions/src/services/youtube.ts`
- Существующие методы возвращают `{ ..., quotaUsed: number }` — следовать этому паттерну
- YouTube API types: нужно добавить интерфейсы для `CommentThread` response в `functions/src/types.ts`

**Tasks:**
- [x] T2.1: TypeScript интерфейсы в `functions/src/types.ts`
- [x] T2.2: `getCommentThreads` в YouTubeService (textFormat=plainText, part=snippet,replies, single-page)
- [x] T2.3: 403 commentsDisabled — YouTubeService throws, handler catches
- [x] T2.4: 8 тестов в `youtube.test.ts` (happy path, pagination, 403, empty, replies, order=time, no nextPageToken)

**Parallelization:**
```
T2.1 — SEQUENTIAL FIRST (types needed by T2.2)
T2.2 + T2.3 — SEQUENTIAL (same method)
T2.4 — after T2.2+T2.3
```

**Verification:**
```bash
npx vitest run --project functions -- youtube
```

**MANDATORY: Update this file before proceeding** — mark tasks, update status table.

---

## Phase 3 — Handler + Definition + Executor

**Goal:** `getVideoComments` tool полностью зарегистрирован и работает в agentic loop.

**Critical Context:**
- Handler pattern: `getChannelOverview.ts` (простой: validate → API key check → YouTubeService call → format response)
- `_systemNote` text — точный текст в feature doc (секция "_systemNote — контроль поведения LLM")
- `coveragePercent` = pre-computed: `fetchedCount / totalTopLevelThreads * 100` (code does math)
- `reportProgress` — обязательно для multi-page (см. feature doc секция "Progress Reporting")

**Tasks:**
- [x] T3.1: Handler `getVideoComments.ts` — validate, pagination loop, progress reporting, commentsDisabled handling
- [x] T3.2: Tool definition + TOOL_NAMES + TOOL_DECLARATIONS
- [x] T3.3: Executor registration

**Parallelization:**
```
T3.1 — SEQUENTIAL FIRST (handler)
T3.2 + T3.3 — PARALLEL (definition + executor, independent files)
```

**Verification:**
```bash
npm run typecheck
npx vitest run --project functions -- getVideoComments
```

**MANDATORY: Update this file before proceeding** — mark tasks, update status table.

---

## Phase 4 — Frontend: toolCallGrouping

**Goal:** UI показывает корректные labels для `getVideoComments` tool calls.

**Critical Context:**
- Файл: `src/features/Chat/utils/toolCallGrouping.ts`
- Labels из feature doc (секция "UI Labels"):
  - pending: `"Reading comments..."`
  - resolved: `"{fetchedCount} comments loaded"`
  - error: `"Couldn't load comments"`
- `isExpandable: false` (Stage 1)
- `extractVideoIdsForTool`: videoId из args (single string, не array)

**Tasks:**
- [x] T4.1: `getGroupLabel` — pending/resolved/error labels
- [x] T4.2: `extractVideoIdsForTool` + `extractCommentVideoIds` extractor
- [x] T4.3: `isExpandable` — default false (no case needed)

**Parallelization:**
```
T4.1 → T4.2 — SEQUENTIAL (один файл, concurrent edits запрещены)
T4.3 — нет действия, просто подтвердить
```

**Verification:**
```bash
npm run typecheck
npm run lint
```

**MANDATORY: Update this file before proceeding** — mark tasks, update status table.

---

## Phase 5 — Tests + Review Gate

**Goal:** Полное покрытие handler'а тестами + review.

**Critical Context:**
- Test pattern: `functions/src/services/tools/handlers/__tests__/getChannelOverview.test.ts`
- Mock: `vi.mock("../../../youtube.js")` с class mock
- CTX fixture: `{ userId: "user1", channelId: "ch1", youtubeApiKey: "test-key" }`

**Tasks:**
- [x] T5.1: Handler tests — 16 tests (validation 3, happy path 4, pagination 3, errors 2, edge cases 4)
- [x] T5.2: Full test suite passed
- [x] T5.3: Test count: 284 frontend (22 files) + 603 backend (43 files) = **887 total (65 files)**
- [x] T5.4: `npm run check` — all passed (lint + typecheck + doc links)

**Verification:**
```bash
npm run check
npx vitest run --project frontend
npx vitest run --project functions
```

### Review Gate — R1 (Architecture + Completeness)

**Prompt for review agent:**

> Read the following files in order:
> 1. `docs/features/chat/tools/layer-2-detail/get-video-comments-tasks.md` (task doc)
> 2. `docs/features/chat/tools/layer-2-detail/3-get-video-comments-tool.md` (feature doc)
> 3. `functions/src/services/youtube.ts` (getCommentThreads method)
> 4. `functions/src/services/tools/handlers/getVideoComments.ts` (handler)
> 5. `functions/src/services/tools/definitions.ts` (tool definition)
> 6. `functions/src/services/tools/executor.ts` (registration)
> 7. `functions/src/services/tools/handlers/getMultipleVideoDetails.ts` (commentCount addition)
> 8. `src/features/Chat/utils/toolCallGrouping.ts` (UI labels)
> 9. `functions/src/services/tools/handlers/__tests__/getVideoComments.test.ts` (tests)
>
> Check these items:
> 1. **textFormat=plainText** — present in API request? Without it, HTML noise in tokens.
> 2. **pageInfo.totalResults** — used for totalTopLevelThreads? NOT video.statistics.commentCount?
> 3. **_systemNote** — present in response? Controls LLM pagination behavior?
> 4. **reportProgress** — called for each page? Different message for page 1 vs 2+?
> 5. **commentsDisabled** — handled gracefully (not crash)?
> 6. **commentCount in formatVideoData** — added? Cached in YouTube API fallback?
> 7. **TOOL_NAMES** — GET_VIDEO_COMMENTS added? TOOL_DECLARATIONS includes it?
> 8. **HANDLERS map** — handler registered?
> 9. **toolCallGrouping** — getGroupLabel, extractVideoIdsForTool, isExpandable all updated?
> 10. **Test coverage** — validation, happy path, pagination, commentsDisabled, edge cases?
> 11. **Feature doc** — still accurate after implementation? No lies?
>
> For each check: PASS or FAIL with one-line explanation.
> Fix all findings before marking complete.

**MANDATORY: Update this file** — mark tasks, update status table, record test count.

---

## FINAL — Doc Updates

- [x] Update feature doc `3-get-video-comments-tool.md`: текущее состояние → "Реализовано (Stage 1)", YOU ARE HERE → Stage 2
- [x] Update `1-get-multiple-video-details-tool.md`: `commentCount` в response schema, `(planned)` убран
- [x] Verify `docs/features/chat/tools/README.md` — getVideoComments в диаграмме и индексе ✓
- [x] Move this task doc to `docs/archive/tasks/chat/get-video-comments-tasks.md`
