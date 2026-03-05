# Backlog: UI Component Consolidation

## CsvDropZone → AudioDropZone Migration
**Приоритет:** Low  
**Статус:** Backlog

### Контекст
Создана shared молекула `CsvDropZone` в `ui/molecules/`. Сейчас используется в:
- ✅ `TrafficUploader.tsx` (Suggested Traffic — full mode)
- ✅ `TrafficSourceTab.tsx` (Traffic Sources — empty state)

### Задача
Адаптировать `AudioDropZone.tsx` (Music) для использования общего `DropZone` компонента.

**Файл:** `src/pages/Music/components/upload/AudioDropZone.tsx`

### Отличия от CsvDropZone
- Принимает аудио файлы (.mp3, .wav, .flac и т.д.)
- Grid layout: cover art (120px) + audio drop zone
- Два слота (vocal + instrumental) с состоянием "all filled"
- Cover art — отдельная зона с image preview

### Рекомендация
Извлечь базовый `DropZone` (без file-type специфики) из `CsvDropZone`, а `CsvDropZone` и `AudioDropZone` строить как обёртки над ним.

---

## ~~Shared Infrastructure: hardlinks → production solution~~
**Приоритет:** Medium  
**Статус:** ✅ Done

### Решение (prebuild copy)
- `auth.ts`, `db.ts` — **backend-only**, удалены из `shared/`, живут только в `functions/src/shared/`
- `models.ts` — единственный реально shared файл, source of truth в `shared/models.ts`
- `functions/scripts/copy-shared.mjs` — prebuild скрипт, копирует `models.ts` → `functions/src/shared/`
- `rootDir: "src"` в `functions/tsconfig.json` — fix output structure (`lib/index.js`)
- `functions/.gitignore` — `src/shared/models.ts` автогенерируемый, не коммитится
- Rogue import в `streamChat.ts` исправлен (`../../../../shared/` → `../../config/models.js`)

---

## ~~Rename `thinkingLevel` → `thinkingOptionId` в API контракте~~
**Приоритет:** Low  
**Статус:** ✅ Done

### Контекст
Поле `thinkingLevel` используется в нашем API (frontend → backend) как **option id** из `ModelConfig.thinkingOptions` (e.g. `"auto"`, `"high"`). Но имя совпадает с Gemini API param `thinkingLevel` (enum: `"low"`, `"medium"`, `"high"`), что создаёт путаницу — одно имя, два значения.

### Задача
Переименовать `thinkingLevel` → `thinkingOptionId` во всём API контракте:
- `AiChatRequest.thinkingLevel` → `thinkingOptionId`
- `StreamChatOpts.thinkingLevel` → `thinkingOptionId`
- `aiProxyService.ts`, `aiService.ts`, `chatStore.ts`, `ChatInput.tsx`
- Маппинг в Gemini API params (`thinkingLevel` / `thinkingBudget`) остаётся только в `streamChat.ts`

### Затронутые файлы (~10)
- `functions/src/types.ts`, `functions/src/chat/aiChat.ts`, `functions/src/services/gemini/streamChat.ts`
- `src/core/services/aiProxyService.ts`, `src/core/services/aiService.ts`
- `src/core/stores/chatStore.ts`, `src/features/Chat/ChatInput.tsx`

---

## Streaming Dots пропадают при навигации назад-вперёд
**Приоритет:** Medium  
**Статус:** Backlog  
**Фича:** Chat

### Контекст
`setActiveConversation` в `chatStore.ts` сбрасывает `isStreaming + streamingNonce` при **любом** переключении — даже при возврате в тот же чат. Stream продолжает бежать на сервере, ответ появится через Firestore subscription, но streaming dots пропадают.

### Задача
Не сбрасывать streaming state при возврате в тот же conversation. Отвязать `streamingNonce` от navigation — nonce должен инвалидироваться только при переключении на **другой** conversation или при явном `stopGeneration`.

### Затронутые файлы
- `src/core/stores/chatStore.ts` — `setActiveConversation`, `handleBack`

---

## browseChannelVideos: `publishedAfter` early stop during pagination
**Приоритет:** Low
**Статус:** Backlog
**Фича:** Chat / YouTube Research Tools

### Контекст
`publishedAfter` фильтр применяется post-fetch (после загрузки всех страниц из YouTube API). Для каналов с <200 видео (1-4 страницы) это не проблема. Для каналов с 1000+ видео — тратит лишнюю квоту.

### Задача
Передать `publishedAfter` в `YouTubeService.getPlaylistVideos()` и остановить пагинацию, когда `publishedAt` видео становится старше порога. YouTube API возвращает видео в обратном хронологическом порядке → early stop безопасен.

### Затронутые файлы
- `functions/src/services/youtube.ts` — `getPlaylistVideos()`: добавить параметр + early stop логику
- `functions/src/services/tools/handlers/browseChannelVideos.ts` — передать `publishedAfter` в сервис

---

## ~~browseChannelVideos: own channel comparison mode~~
**Приоритет:** Low
**Статус:** ✅ Done
**Фича:** Chat / YouTube Research Tools

### Контекст
Для собственного канала пользователя (`channelId === ctx.channelId`) полезно показывать сравнение: `{ inApp: 42, onYouTube: 47, missing: 5 }` — какие видео есть в приложении, какие только на YouTube, какие отсутствуют.

### Задача
Когда `channelId === ctx.channelId`, сравнить fetched video IDs с коллекцией `videos/` и показать delta в ответе.

### Затронутые файлы
- `functions/src/services/tools/handlers/browseChannelVideos.ts`

---

## ✅ Consolidate external video caches into single collection
**Приоритет:** Medium
**Статус:** Done (Phases 0-4 complete, Phase 5 cleanup pending production verification)
**Фича:** Chat / YouTube Research Tools
**План:** `docs/decisions/cache-consolidation/cache-consolidation-plan.md`

### Контекст
"Чужие" видео хранятся в 2 коллекциях + trend subcollections:

| Коллекция | Источник | Записывает |
|-----------|----------|------------|
| `cached_suggested_traffic_videos/` | `analyzeSuggestedTraffic` | suggested traffic handler + frontend repair |
| `cached_external_videos/` | `browseChannelVideos`, YouTube API fallback | browse + getMultipleVideoDetails |
| `trendChannels/{channelId}/videos/` | Trend sync (scheduled) | sync service (НЕ трогаем — отдельный тул) |

### Задача
Объединить `cached_suggested_traffic_videos/` в `cached_external_videos/`. Убрать trendChannels fallback из tool handlers — trend data access будет через отдельный будущий тул `lookupTrendVideos`.

### Решение
- **`trendChannels/` остаётся отдельной коллекцией** — используется в 20+ местах Trends UI. Скрытый fallback в handlers заменяется на explicit тул (см. backlog ниже).
- **`sync.ts` не меняется** — пишет только в `trendChannels/` как раньше.
- **Миграция** только `cached_suggested_traffic_videos/` → `cached_external_videos/` (с `source: "suggested_traffic"`).

### Выигрыш
- `getMultipleVideoDetails`: 4-level → 3-level (`videos/` → `cached_external_videos/` → YouTube API)
- `browseChannelVideos`: 3-level → 2-level (удаление ~40 строк trend fallback)
- Единая плоская коллекция для всех tool lookups
- Меньше параллельных batch reads

### Deploy order
1. Migration script (Phase 0) — ДО деплоя кода
2. Backend + Frontend (Phase 1-2)
3. Tests + Docs (Phase 3-4)
4. Manual cleanup старой коллекции

### Затронутые файлы (~20)
→ Полный список в `docs/features/cache-consolidation-plan.md`

---

## lookupTrendVideos: explicit tool for trend cache access
**Приоритет:** Low
**Статус:** Backlog
**Фича:** Chat / YouTube Research Tools
**Зависит от:** Cache Consolidation (выше)

### Контекст
После cache consolidation tool handlers не знают про `trendChannels/`. Но trend sync бесплатно скачивает сотни видео конкурентов — эти данные должны быть доступны LLM как explicit capability, а не скрытый fallback.

### Задача
Новый тул `lookupTrendVideos` для явного доступа к trend cache:
- Параметры: `channelId` (required) — ID tracked конкурента
- Возвращает: список видео из `trendChannels/{channelId}/videos/`
- 0 YouTube API quota (всё из кеша)
- LLM вызывает явно, когда знает что видео от tracked конкурента

### Telescope Pattern integration
```
getChannelOverview → browseChannelVideos → lookupTrendVideos → getMultipleVideoDetails
```
LLM может выбрать `lookupTrendVideos` вместо `browseChannelVideos` если канал уже tracked — экономия квоты.

### Затронутые файлы (~6)
- `functions/src/services/tools/handlers/lookupTrendVideos.ts` — NEW handler
- `functions/src/services/tools/definitions.ts` — tool definition
- `functions/src/services/tools/executor.ts` — handler registration
- `src/features/Chat/utils/toolCallGrouping.ts` — tool label
- `src/features/Chat/components/ToolCallSummary.tsx` — tool pill
- `docs/features/chat/youtube-research-tools.md` — architecture update

---

## ~~browseChannelVideos: split two-phase tool into two separate tools~~
**Приоритет:** Medium
**Статус:** ✅ Done (T3.2)
**Фича:** Chat / YouTube Research Tools

### Контекст
`browseChannelVideos` сейчас работает в двух режимах через boolean `confirmed`:
- Phase 1 (без `confirmed`): возвращает channel info + quota estimate
- Phase 2 (`confirmed=true`): фетчит список видео

Это нарушает SRP — один тул, два поведения. Текущий workaround: Phase 2 требует `uploadsPlaylistId` из ответа Phase 1 (LLM не может его угадать → структурная зависимость). Но архитектурно правильнее разбить на два тула.

### Задача
Разделить на:
1. **`getChannelOverview`** — resolve channel + return metadata (title, videoCount, subscriberCount, uploadsPlaylistId, quotaEstimate). Всегда safe, 1 unit.
2. **`browseChannelVideos`** — принимает `uploadsPlaylistId` (required), фетчит видео. Без `confirmed` parameter.

### Выигрыш
- Чистый SRP: каждый тул = одна задача
- Зависимость структурная by design, а не через workaround
- Нет boolean-переключателя режимов
- LLM описания проще и однозначнее

### Затронутые файлы
- `functions/src/services/tools/handlers/browseChannelVideos.ts` — refactor
- `functions/src/services/tools/definitions.ts` — new tool + update existing
- `functions/src/services/tools/executor.ts` — new handler registration
- `functions/src/services/tools/handlers/__tests__/browseChannelVideos.test.ts` — split tests
- `src/features/Chat/utils/toolCallGrouping.ts` — new tool label
- `src/features/Chat/components/ToolCallSummary.tsx` — new tool pill
- `docs/features/chat/youtube-research-tools.md` — update architecture doc

