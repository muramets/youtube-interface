# Video Tooltip & Video Map

> **Статус:** Завершено
> **Task doc:** `docs/archive/tasks/chat/video-tooltip-refactor-tasks.md`

## Что это

Когда AI-ассистент вызывает инструменты (browse videos, find similar, mention video и т.д.), каждый возвращает данные о видео. Эти данные собираются в единую "карту видео" (video map), а при наведении мышки на видео в чате показывается tooltip с метаданными. Тот же tooltip используется в Trends и Traffic — с другим размером, но идентичным содержимым.

## Текущее состояние

Единый `VideoPreviewTooltip` с двумя режимами: `full` (800×700, Trends/Traffic) и `mini` (480×auto, Chat). Dedicated тип `VideoPreviewData` — чистый tooltip-ориентированный тип без baggage от app context. `buildToolVideoMap` собирает данные из 7 tool extractors в `Map<string, VideoPreviewData>`. `ToolCallSummary` — orchestrator (215 строк) + 11 модулей в `toolStats/`. Tool registry (13 tools) обеспечивает Open-Closed: новый tool = запись в registry + extractor в buildToolVideoMap + extractor в toolCallGrouping.

## Ключевые архитектурные решения

### VideoPreviewData — dedicated tooltip type

`VideoPreviewData` (в `src/features/Video/types.ts`) заменил `VideoCardContext` в tooltip path. `VideoCardContext` — member дискриминированного union `AppContextItem`, несущий поля нерелевантные для tooltip (`type: 'video-card'`, `ownership: required`, `viewCount: string`). Новый тип: `viewCount: number` (без roundtrip), все поля кроме `videoId`/`title` optional. Adapter `toPreviewData()` существует в одном месте — `ChatMessageList`.

### Merge strategy: first-write-wins

`buildToolVideoMap` обрабатывает tool results хронологически. `mergeInto()` заполняет пустые поля, но не перезаписывает. Работает благодаря Telescope Pattern — AI вызывает tools от общего к частному, каждый добавляет новые поля. Единственный gap — `viewCount` freshness (Firestore cache vs YouTube API), но для информационного tooltip это acceptable trade-off.

### Осознанные gaps (НЕ баги)

- **`getVideoComments` не в `buildToolVideoMap`** — comments не video metadata, tool возвращает комментарии.
- **`browseChannelVideos` не в `extractVideoIdsForTool()`** — browse может вернуть десятки видео, показывать все как video rows — noise. `BrowseChannelStats` (summary) — правильный формат.

### Thumbnail resolution

Консолидирована в shared утилиту `resolveThumbnailUrl` (backend). Три правила: Firestore `thumbnail` → passthrough; `custom-*` без thumbnail → `undefined`; YouTube video → CDN fallback `mqdefault.jpg`. Frontend — чистый passthrough, не генерирует URL.

## Technical Implementation

### Ключевые файлы

| Файл | Роль |
|---|---|
| `src/features/Video/types.ts` | `VideoPreviewData` type + `PREVIEW_DIMENSIONS` constants |
| `src/features/Video/components/VideoPreviewTooltip.tsx` | Unified tooltip: `full`/`mini` modes |
| `src/features/Chat/utils/buildToolVideoMap.ts` | 7 extractors → `Map<string, VideoPreviewData>` |
| `src/features/Chat/utils/toolCallGrouping.ts` | Группировка, videoIds, labels, `isExpandable()` via registry |
| `src/features/Chat/utils/toolRegistry.ts` | 13 tools: icon, color, StatsComponent, hasExpandableContent |
| `src/features/Chat/components/ToolCallSummary.tsx` | Orchestrator (215 строк) |
| `src/features/Chat/components/toolStats/` | 11 модулей: Stats per tool + ThumbnailGrid + QuotaBadge |
| `src/features/Chat/utils/toPreviewData.ts` | Adapter `VideoCardContext → VideoPreviewData` |
| `src/components/ui/atoms/CopyButton.tsx` | Shared copy button atom |
| `src/core/utils/formatUtils.ts` | `formatDelta()`, `getDeltaColor()` shared utilities |
| `functions/src/services/tools/utils/resolveThumbnailUrl.ts` | SSOT: thumbnail URL resolution (3-rule cascade) |

### Тесты

| Файл | Кейсов | Покрытие |
|---|---|---|
| `buildToolVideoMap.test.ts` | 21 | Все 7 extractors, delta merge, channelName fallback |
| `toolCallGrouping.test.ts` | 11 | searchDatabase videoIds, labels, isExpandable |
| `resolveThumbnailUrl.test.ts` | 9 | 3-rule cascade |
