# Sync Architecture

## Что это
Система из 4 sync-пайплайнов, которые обновляют данные видео из YouTube API и переиспользуют данные друг друга для экономии API квоты. Плюс 5-й пайплайн (Smart Search), который генерирует embeddings для AI-поиска, читая данные из Trends.

## Текущее состояние
- [x] 4 sync-пайплайна работают, данные между ними консистентны
- [x] Cross-cache: Channel Sync читает из Trends cache → экономия YouTube API квоты
- [x] Все пайплайны пишут одинаковый набор полей (field parity достигнут)
- [x] `subscriberCount` обновляется при каждом Trends Sync (backend + frontend sidebar)
- [x] Notification categories → `docs/features/notification-categories.md`
- [x] Custom видео с `publishedVideoId` синхронизируются в Channel Sync (batch + ID mapping)
- [x] Все 5 пайплайнов покрыты тестами
- [x] YouTube API error handling: `fetchVideosBatch` и `fetchVideoDetails` проверяют `videoData.error`, различают quota/rateLimit vs private (403 reason parsing)
- [x] Cross-cache оптимизирован: batch `getDocs` queries вместо N отдельных `getDoc` (30 IDs per query)
- [x] `refreshSubscriberCounts` чанкуется по 400 (защита от Firestore 500-op batch limit)
- [x] Partial failure observability: `apiSkippedCount` + warning notification при network errors
- [ ] Деплой backend (functions) с последними изменениями

---

## Обзор пайплайнов

| # | Pipeline | Где работает | Триггер | Куда пишет | Источник данных |
|---|----------|-------------|---------|------------|-----------------|
| 1 | **Channel Sync** | Frontend | Auto-timer / кнопка Sync Now / tab focus | `videos/{videoId}` | Trends cache → YouTube API fallback |
| 2a | **Trends Sync (sidebar)** | Frontend | Правый клик → Sync в Sidebar | `trendChannels/{id}/videos/{videoId}` + `trendChannels/{id}` | YouTube API |
| 2b | **Trends Sync (backend)** | Cloud Function | Ежедневно 00:00 UTC / кнопка в UI | `trendChannels/{id}/videos/{videoId}` + `trendChannels/{id}` + `snapshots/` | YouTube API |
| 3 | **Smart Search Sync** | Cloud Function | Ежедневно 00:30 UTC | `globalVideoEmbeddings/{videoId}` | Читает из `trendChannels/*/videos/` |
| 4 | **Video Fetch Retry** | Frontend | Каждый час (автоматически) | `videos/{videoId}` | YouTube API |

Все пути Firestore начинаются с `users/{userId}/channels/{channelId}/`.

---

## Что пишет каждый пайплайн

### Данные видео

| Поле | Channel Sync (batch) | Channel Sync (single) | Trends Sync (sidebar 2a) | Trends Sync (backend 2b) | Video Fetch Retry |
|------|---------------------|----------------------|--------------------------|--------------------------|-------------------|
| `title` | + | + | + | + | + |
| `thumbnail` (maxres priority) | + | + | + | + | + |
| `viewCount` | + (string) | + (string) | + (number) | + (number) | + (string) |
| `likeCount` | + (string) | + (string) | + (number) | + (number) | + (string) |
| `commentCount` | — | — | + (number) | + (number) | — |
| `duration` | + | + | + | + | + |
| `description` | + | + | + | + | + |
| `tags` | + | + | + | + | + |
| `publishedAt` | + | + | + | + | + |
| `channelId` | + | + | + (= parent) | + (= parent) | + |
| `channelTitle` | + | + | + | + | + |
| `channelAvatar` | + | + | — | — | + |
| `subscriberCount` | + (string) | + (string) | — | — | + (string) |
| `lastUpdated` | + | + | + | + | — |
| `fetchStatus` | + | + | — | — | + |

**Важные различия:**
- **viewCount type**: `videos/` хранит **string** (YouTube API возвращает string), `trendChannels/*/videos/` хранит **number** (парсится при записи). Cross-cache конвертирует: `String(td.viewCount)`.
- **channelAvatar / subscriberCount**: пишутся только в `videos/` (Channel Sync), потому что это данные канала-владельца, не самого видео. В Trends они хранятся в родительском документе `trendChannels/{id}`.
- **commentCount**: пишется только Trends Sync. Channel Sync (`fetchVideosBatch`) не извлекает это поле из YouTube API ответа.

### Данные канала (TrendChannel документ)

| Поле | При добавлении канала | Trends Sync (sidebar 2a) | Trends Sync (backend 2b) |
|------|----------------------|--------------------------|--------------------------|
| `subscriberCount` | + (из YouTube API) | + (refresh, +1 API unit) | + (batch refresh, +1 unit на все каналы) |
| `avatarUrl` | + | + (только при `refreshAvatar: true`) | + (только при `refreshAvatar: true`) |
| `averageViews` | — | + | + |
| `totalViewCount` | — | + | + |
| `videoCount` | — | + | + |
| `performanceDistribution` | — | + | + |
| `lastUpdated` | 0 | + | + |

### Snapshots (история)

Только **Trends Sync backend (2b)** создаёт snapshots:
- Коллекция: `trendChannels/{id}/snapshots/{timestamp}`
- Данные: `{ timestamp, videoViews: { [videoId]: viewCount }, videoCount, type: 'auto'|'manual' }`
- Idempotency guard: максимум 1 snapshot per UTC day

---

## Переиспользование данных между пайплайнами

### Channel Sync ← читает из Trends cache (Cross-Cache)

```
                  ┌────────────────────────┐
                  │   Trends Firestore     │
                  │  trendChannels/*/      │
                  │    videos/{videoId}    │
                  │    (TrendChannel doc)  │
                  └──────────┬─────────────┘
                             │ Phase 1: getDocs() batch query
                             │ grouped by channel, 30 IDs per query
                             │ if fresh → use cache
                             ▼
┌─────────────┐    ┌──────────────────┐    ┌──────────────┐
│  syncAll     │───▶│ syncVideosWith   │───▶│   videos/    │
│  Videos()    │    │ CrossCache()     │    │  {videoId}   │
│  manualSync()│    │                  │    │  (Firestore) │
└─────────────┘    └────────┬─────────┘    └──────────────┘
                            │ Phase 2: remaining
                            ▼
                  ┌────────────────────────┐
                  │   YouTube Data API     │
                  │  fetchVideosBatch()    │
                  └────────────────────────┘
```

**Как работает:**
1. `fetchTrendChannels()` — один `getDocs` запрос (5-20 документов), работает всегда (не зависит от состояния UI)
2. Overlap-видео группируются по `channelId`, и для каждой группы выполняется batch `getDocs` с `where(documentId(), 'in', [...30 IDs])` — вместо N отдельных `getDoc` вызовов
3. **Freshness check:** `trendVideo.lastUpdated > video.lastUpdated` → использовать кэш. Иначе → fallback на YouTube API
4. `subscriberCount` и `channelAvatar` берутся из родительского `TrendChannel` документа
5. Конвертация типов: `viewCount: String(number)`, `likeCount: String(number)`

**Когда НЕ работает:**
- Видео со своего канала (не трекается в Trends)
- Видео с канала, не добавленного в Trends
- `syncVideo()` (single video) — всегда идёт в YouTube API (trade-off: 2 units vs сложность)

### Smart Search Sync ← читает из Trends

```
trendChannels/*/videos/  →  Smart Search Sync  →  globalVideoEmbeddings/{videoId}
     (title, tags,              (Gemini +              (packaging + visual
      description,            Vertex AI)               embeddings)
      thumbnail)
```

Smart Search не вызывает YouTube API. Он только читает данные из Trends Firestore и генерирует embeddings.

---

## Триггеры и расписание

| Время (UTC) | Что происходит |
|-------------|---------------|
| 00:00 | `scheduledTrendSnapshot` — backend Trends Sync для всех пользователей |
| 00:30 | `scheduledEmbeddingSync` — Smart Search генерирует embeddings для новых/обновлённых видео |
| Каждый час | `useVideoFetchRetry` — ретраит failed видео |
| По таймеру (настраивается, default 24h) | `useAutoSync` → `syncAllVideos()` — Channel Sync |
| Tab focus | `useAutoSync` — проверяет, не пропущен ли Channel Sync |
| Ручной | Settings → Sync Now / Sidebar → Right-click → Sync / Trends header → кнопка sync |

---

## YouTube API квота — расход по пайплайнам

| Pipeline | Расход |
|----------|--------|
| Channel Sync (batch, 200 видео) | ~8 units (если все из Trends cache → 0 units) |
| Channel Sync (single video) | 2 units (video + channel) |
| Trends Sync backend (15 каналов × 200 видео) | ~75 units (playlist pages + video batches) + 1 unit (subscriberCount batch) |
| Trends Sync sidebar (1 канал) | ~5-10 units (playlist pages + video batches) + 1 unit (subscriberCount + optional avatar) |
| Smart Search Sync | 0 units (не использует YouTube API) |
| Video Fetch Retry | 2 units per retried video |

---

## Technical Implementation

### Channel Sync
- `src/core/hooks/useVideoSync.ts` — `syncVideosWithCrossCache()` (shared engine), `syncAllVideos()`, `manualSync()`, `syncVideo()`
- `src/core/hooks/useAutoSync.ts` — timer + tab focus trigger
- `src/core/utils/youtubeApi.ts` — `fetchVideosBatch()`, `fetchVideoDetails()`
- `src/core/services/trendService.ts` — `fetchTrendChannels()` (one-time read для cross-cache)

### Trends Sync — Frontend Sidebar
- `src/core/services/trendService.ts` — `syncChannelVideos()`: videos + channel stats + subscriberCount refresh
- `src/core/types/trends.ts` — `TrendVideo` interface (includes `likeCount`, `commentCount`)

### Trends Sync — Backend
- `functions/src/trends/scheduledSync.ts` — daily cron (00:00 UTC)
- `functions/src/trends/manualSync.ts` — callable from frontend
- `functions/src/services/sync.ts` — `SyncService.syncChannel()` (+ dirty detection → embedding queue writes), `refreshSubscriberCounts()`, `sendNotification()`
- `functions/src/services/youtube.ts` — `getPlaylistVideos()`, `getVideoDetails()`, `getChannelSubscriberCounts()`

### Smart Search Sync
- `functions/src/embedding/embeddingQueue.ts` — dirty queue: `isContentChanged` (pure), `enqueueVideoForEmbedding`, `readEmbeddingQueue`
- `functions/src/embedding/scheduledEmbeddingSync.ts` — queue-based launcher: read queue → write syncState → enqueue first batch (cron 00:30 UTC, fallback to full scan)
- `functions/src/embedding/embeddingSyncBatch.ts` — self-chaining batch processor + queue cleanup (reads syncState → processes batch → cleanup → enqueue next / finalize)
- `functions/src/embedding/embeddingSync.ts` — `discoverChannels()` (used by fallback + backfill)
- `functions/src/embedding/processOneVideo.ts` — shared per-video logic (download thumbnail once → generate packaging + description + visual)
- `functions/src/embedding/taskQueue.ts` — shared Cloud Tasks helper (`enqueueBatch`, `pLimit`)
- `functions/src/embedding/backfillEmbeddings.ts` — Cloud Task chain for manual backfill (full scan via `discoverChannels`)

### Video Fetch Retry
- `src/core/hooks/useVideoFetchRetry.ts` — hourly retry of failed custom videos

### Shared Types
- `functions/src/types.ts` — `TrendChannel` (aligned with frontend), `YouTubeVideoItem`, `Notification`
- `src/core/types/trends.ts` — `TrendChannel`, `TrendVideo`
- `src/core/utils/youtubeApi.ts` — `VideoDetails` (frontend video type)

### Notifications
- → `docs/features/notification-categories.md`

### 1511 тестов проходят (603 frontend + 908 backend), lint + typecheck чисто.
