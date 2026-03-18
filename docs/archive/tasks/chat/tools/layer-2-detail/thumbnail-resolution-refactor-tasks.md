# Thumbnail Resolution Refactor — Task Doc

## Quick Context Recovery

1. **Этот файл** — task doc, execution plan
2. `docs/features/chat/video-tooltip-refactor.md` — feature doc (Known Issue: Thumbnail Resolution Architecture)
3. `functions/src/services/tools/utils/resolveThumbnailUrl.ts` — целевая утилита (создать)
4. `functions/src/services/tools/handlers/utility/mentionVideo.ts:29` — текущий inline thumbnail logic
5. `functions/src/services/tools/handlers/detail/getMultipleVideoDetails.ts:198` — текущий `data.thumbnail || undefined`
6. `src/features/Chat/utils/buildToolVideoMap.ts:275` — фронтенд `ytThumbnailUrl()` (удалить)

## Key Decisions (carry forward)

1. **Backend owns thumbnail resolution.** Фронтенд — чистый display, никогда не генерирует URL. Причина: backend знает источник данных (Firestore, embeddings, YouTube API), фронтенд не должен знать внутреннюю топологию.

2. **Одна shared утилита `resolveThumbnailUrl`** — 3 правила: Firestore → custom-* undefined → YouTube CDN. Причина: single source of truth vs разбросанная логика в 7 handler'ах + 4 frontend extractors.

3. **Без defensive fallback на фронтенде.** `ytThumbnailUrl()` удаляется из `buildToolVideoMap` полностью. `VideoPreviewTooltip` НЕ генерирует CDN URL. Защита через тесты, не через молчаливые fallback. Причина: fallback маскирует баги backend, создаёт дублирование.

4. **`thumbnailUrl` НЕ добавляем в агрегаты** (getNicheSnapshot). Ни в `aggregates.topByViews[]`, ни в `competitorActivity[].topPerformer`. Оба — агрегаты для LLM текстового контекста. Данные уже в `competitorActivity.videos[]`, откуда buildToolVideoMap берёт их. Добавлять — дублирование.

5. **Единый размер `mqdefault.jpg` (320×180).** `hqdefault.jpg` в VideoPreviewTooltip заменяется на `video.thumbnailUrl` из video map. Причина: консистентность, один источник.

6. **`data.thumbnailUrl` fallback — мёртвый код, удалить.** Research подтвердил: все Firestore writers для видео используют `thumbnail`, НЕ `thumbnailUrl`. Fallback `?? data.thumbnailUrl` в `browseChannelVideos.ts:134` никогда не срабатывает. `thumbnailUrl` существует только в gallery items и memory serialization — другие коллекции, другой контекст.

## Agent Orchestration Strategy

Main context = executor + orchestrator. Subagents для параллельных тестов и review.

## Phase Status

| Phase | Status |
|-------|--------|
| P0: Create shared utility + tests | DONE |
| P1: Migrate backend handlers | DONE |
| P2: Clean up frontend | DONE |
| P3: Update docs + final verification | DONE |

## Current Test Count

**384 frontend + 725 backend = 1109 total** (76 files) — final count after all phases.

---

## P0: Create shared utility + tests

**Goal:** Создать `resolveThumbnailUrl` и покрыть тестами.

**Tasks:**
- [x] Create `functions/src/services/tools/utils/resolveThumbnailUrl.ts`
  ```typescript
  export function resolveThumbnailUrl(
      videoId: string,
      firestoreThumbnail?: string | null,
  ): string | undefined {
      if (firestoreThumbnail) return firestoreThumbnail;
      if (videoId.startsWith('custom-')) return undefined;
      return `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`;
  }
  ```
- [x] Create `functions/src/services/tools/utils/__tests__/resolveThumbnailUrl.test.ts`
  - YouTube ID → CDN URL (`mqdefault.jpg`)
  - `custom-*` без thumbnail → `undefined`
  - Firestore thumbnail → passthrough (Firebase Storage URL)
  - Firestore thumbnail → passthrough (YouTube CDN URL from sync)
  - Empty string `''` → CDN fallback (falsy → не passthrough)
  - `null` → CDN fallback
  - `undefined` → CDN fallback

**Verification:** `npx vitest run --project functions -- resolveThumbnailUrl`

**MANDATORY: Update this file before proceeding** — mark tasks, update status table.

---

## P1: Migrate backend handlers

**Goal:** Все 7 handlers используют `resolveThumbnailUrl`. Inline логика удалена.

**Critical Context:**
- `mentionVideo.ts:29-30` — inline `data.thumbnail || (custom ? '' : CDN)`. Заменить на `resolveThumbnailUrl(videoId, data.thumbnail)`. ⚠️ Сейчас возвращает `''` для custom — после фикса будет `undefined`. Downstream OK (falsy).
- `getMultipleVideoDetails.ts:198` — `data.thumbnail || undefined`. Заменить на `resolveThumbnailUrl(videoId, data.thumbnail)`. ⚠️ Добавляет CDN fallback, которого раньше не было — это improvement, не regression.
- `browseChannelVideos.ts:134` — `data.thumbnail ?? data.thumbnailUrl ?? CDN`. Заменить на `resolveThumbnailUrl(videoId, data.thumbnail)`. ⚠️ `data.thumbnailUrl` — мёртвый fallback (research confirmed: все writers используют `thumbnail`). Удалить.
- `browseTrendVideos.ts:159-160` — `data.thumbnail ?? CDN`. Заменить на `resolveThumbnailUrl(videoId, data.thumbnail)`.
- `getNicheSnapshot.ts:202-209` — НЕ читает thumbnail из `vData`. Добавить `thumbnail` read + `resolveThumbnailUrl(vDoc.id, vData.thumbnail)` в video response (строка 254, внутри `cr.windowVideos.map`). ⚠️ Обновить `VideoDoc` interface (строка 155) — добавить `thumbnail?: string`.
- `findSimilarVideos.ts:398` — НЕ возвращает thumbnailUrl. Добавить `thumbnailUrl: resolveThumbnailUrl(r.videoId)`. Embeddings не хранят thumbnail — только CDN fallback.
- `searchDatabase.ts` — НЕ возвращает thumbnailUrl. Аналогично findSimilarVideos — добавить `thumbnailUrl: resolveThumbnailUrl(videoId)`.

**Tasks:**
- [x] `mentionVideo.ts` — import + replace inline logic
- [x] `getMultipleVideoDetails.ts` — import + replace `data.thumbnail || undefined`
- [x] `browseChannelVideos.ts` — import + replace inline logic
- [x] `browseTrendVideos.ts` — import + replace inline logic
- [x] `getNicheSnapshot.ts` — add `thumbnail` to VideoDoc, read `vData.thumbnail`, add `thumbnailUrl` to video response
- [x] `findSimilarVideos.ts` — add `thumbnailUrl` to similar video response
- [x] `searchDatabase.ts` — add `thumbnailUrl` to search result response
- [x] Update existing handler tests that assert on `thumbnailUrl` (getMultipleVideoDetails bugfix: undefined → CDN fallback)

**Verification:** `npx vitest run --project functions`

**MANDATORY: Update this file before proceeding** — mark tasks, update status table, record test count.

---

## P2: Clean up frontend

**Goal:** Фронтенд — чистый display. Удалить `ytThumbnailUrl()`, все extractors pass-through.

**Tasks:**
- [x] `buildToolVideoMap.ts` — удалить `ytThumbnailUrl()` helper function
- [x] `buildToolVideoMap.ts` — в `extractSimilar`: passthrough `v.thumbnailUrl`
- [x] `buildToolVideoMap.ts` — в `extractTrendVideos`: passthrough `v.thumbnailUrl`
- [x] `buildToolVideoMap.ts` — в `extractNicheSnapshot`: passthrough `v.thumbnailUrl`
- [x] `buildToolVideoMap.ts` — в `extractSearchDatabase`: passthrough `v.thumbnailUrl`
- [x] `VideoPreviewTooltip.tsx:127` — заменить CDN генерацию на `video.thumbnailUrl`
- [x] Обновить `buildToolVideoMap.test.ts` — mock results теперь включают `thumbnailUrl` (как backend возвращает)

**Verification:** `npm run check` + `npx vitest run --project frontend`

**MANDATORY: Update this file before proceeding** — mark tasks, update status table, record test count.

---

## P3: Update docs + final verification

**Goal:** Документация отражает новый контракт. Все тесты проходят.

**Tasks:**
- [x] Обновить `docs/features/chat/video-tooltip-refactor.md` — Known Issue → Resolved, описать `resolveThumbnailUrl` контракт
- [x] Обновить Technical Implementation — добавить `resolveThumbnailUrl.ts`
- [x] Запустить полный test suite: `npm run test:run` — 1109 passed (76 files)
- [x] `npm run check` (lint + typecheck + doc links) — all green

**Verification:** All green.

---

## Review Gate (after P2)

**Prompt for review agent:**
1. Есть ли где-то в codebase генерация YouTube CDN thumbnail URL вне `resolveThumbnailUrl`? (`grep -r "i.ytimg.com" --include="*.ts"`). **Исключить из scope:** `exportTrendsVideoCsv.ts`, `exportPlaylistCsv.ts`, `exportTrafficCsv.ts` (CSV export — `hqdefault.jpg` для скачиваемого файла, другой контекст), `zipUtils.ts` (detection, не generation), `viewThumbnails.ts` (AI visual analysis — намеренно без CDN fallback).
2. Все ли 7 tool handlers импортируют и используют `resolveThumbnailUrl`?
3. Остались ли вызовы `ytThumbnailUrl` во frontend?
4. `VideoPreviewTooltip` — генерирует ли CDN URL самостоятельно?
5. `mentionVideo` — возвращает `undefined` (не `''`) для custom без thumbnail?

Fix all findings before P3.
