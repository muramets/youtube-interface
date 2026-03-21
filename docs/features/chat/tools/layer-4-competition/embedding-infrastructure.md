# Embedding Infrastructure

## Что это

Серверный pipeline, который генерирует и поддерживает в актуальном состоянии vector embeddings для всех видео конкурентов. Это фундамент, на котором работают `findSimilarVideos` (визуальный и текстовый поиск похожих видео) и `searchDatabase` (free-text семантический поиск).

## Зачем

Без embeddings AI-ассистент не может сравнивать видео по визуалу или теме — только по точным совпадениям title/tags. Embeddings дают "понимание" содержания: два видео с разными названиями, но одинаковой обложкой (женщина в саду, импрессионизм) будут найдены как визуально похожие.

## Текущее состояние

**Стадия: Production, incremental queue-based sync.**

- `globalVideoEmbeddings` — глобальная Firestore коллекция (~4600 видео, 39 каналов)
- Два типа embeddings: packaging (768d, текст) + visual (1408d, thumbnail image)
- Incremental sync: Trends Sync пишет в dirty queue → Embedding Sync (00:30 UTC) обрабатывает только queue
- Budget safeguard: $5/month hard stop
- Экономия ~150K+ Firestore reads/month по сравнению с full scan

## Roadmap

### Этап 0: Базовая архитектура (full scan)

**Что работает:**
- Packaging embedding (gemini-embedding-001, 768d): title + tags + description
- Visual embedding (Vertex AI multimodalembedding@001, 1408d): thumbnail image
- Thumbnail description (Gemini Flash Vision): текстовое описание обложки
- Budget tracking + hard stop ($5/month)
- Model version stamping — bump `CURRENT_VERSION` для автоматической миграции всех embeddings
- `thumbnailUnavailable` sentinel — удалённые/приватные видео не ретраятся каждую ночь

### Этап 1: Инкрементальный sync ← YOU ARE HERE

**User flow:** Автоматический, невидимый. Trends Sync сравнивает 4 content-поля (title, tags, description, thumbnail) и записывает изменённые видео в dirty queue. Embedding Sync обрабатывает только queue.

- [x] `system/embeddingQueue/videos/{videoId}` — dirty queue (subcollection)
- [x] `SyncService.syncChannel()` пишет в очередь атомарно с video writes (pre-read + dirty detection)
- [x] `scheduledEmbeddingSync` читает queue, не full scan
- [x] Fallback на full scan при первом запуске (empty queue + empty embeddings)
- [x] Queue cleanup per-batch после обработки (failed остаются для retry)
- [x] `processOneVideo` — description + thumbnailUrl dirty detection alignment

**Ожидаемый результат:**
- Ежедневно: ~50-200 видео вместо 4400 → 1 batch вместо 45 → секунды вместо минут
- Firestore reads: ~200 вместо 4400 (экономия 95%)
- Weekly full scan: остаётся как safety net

### Этап 2: Market-ready (50K+ видео)

- Subcollection-based syncState (текущий document имеет лимит 1MB ≈ 16K видео)
- Parallel batch processing (сейчас sequential chaining)
- Tiered budget: отдельные лимиты на packaging vs visual vs description
- Embedding quality monitoring: периодическая проверка cosine similarity distribution
- Multi-region: если юзеры не только в US

---

## Technical Implementation

### Файловая структура

```
functions/src/embedding/
  types.ts                    # EmbeddingDoc, constants, COST_PER_VIDEO, model versions
  processOneVideo.ts          # Per-video logic: check → download → generate → write
  thumbnailDownload.ts        # YouTube thumbnail download (maxresdefault → mqdefault)
  packagingEmbedding.ts       # 768d text embedding (gemini-embedding-001)
  visualEmbedding.ts          # 1408d image embedding (Vertex AI multimodalembedding@001)
  thumbnailDescription.ts     # Gemini Flash Vision description
  queryEmbedding.ts           # Query embedding для searchDatabase (RETRIEVAL_QUERY)
  rrfMerge.ts                 # Reciprocal Rank Fusion (packaging + visual merge, k=60)
  vectorSearch.ts             # Batched findNearest() queries
  embeddingSync.ts            # Channel discovery (used by fallback + backfill)
  embeddingQueue.ts           # Dirty queue: isContentChanged, enqueueVideoForEmbedding, readEmbeddingQueue
  scheduledEmbeddingSync.ts   # Cloud Scheduler entry point (queue-based launcher, fallback to full scan)
  embeddingSyncBatch.ts       # Self-chaining batch processor + queue cleanup
  backfillEmbeddings.ts       # Manual backfill (full scan via discoverChannels)
  budgetTracker.ts            # $5/month hard stop
  taskQueue.ts                # Cloud Tasks helper + pLimit
```

### Firestore коллекции

- `globalVideoEmbeddings/{youtubeVideoId}` — embedding документы (content-addressable, shared between users)
- `system/embeddingQueue/videos/{videoId}` — dirty queue (changed videos pending embedding sync)
- `system/embeddingBudget` — monthly cost tracking
- `system/syncState` — batch orchestration state (video list, progress)
- `system/embeddingStats` — coverage statistics (written by sync as side-effect)

### Ключевые решения

- **`sddefault` исключён из thumbnail fallback** — формат 4:3, YouTube добавляет чёрные letterbox полосы для 16:9 видео, что "отравляет" visual embedding (cosine similarity падает с ~0.78 до ~0.54)
- **Fallback chain: `maxresdefault` → `mqdefault`** — оба 16:9, консистентное кадрирование важнее разрешения
- **`FieldValue.vector()`** для хранения embeddings — нативный Firestore vector тип для `findNearest()`
- **Budget per-video cost = $0.00024** (packaging ~$0.00004 + description ~$0.0001 + visual ~$0.0001)
