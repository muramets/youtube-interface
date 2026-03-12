# Embedding Infrastructure

## Что это

Серверный pipeline, который генерирует и поддерживает в актуальном состоянии vector embeddings для всех видео конкурентов. Это фундамент, на котором работают `findSimilarVideos` (визуальный и текстовый поиск похожих видео) и `searchDatabase` (free-text семантический поиск).

## Зачем

Без embeddings AI-ассистент не может сравнивать видео по визуалу или теме — только по точным совпадениям title/tags. Embeddings дают "понимание" содержания: два видео с разными названиями, но одинаковой обложкой (женщина в саду, импрессионизм) будут найдены как визуально похожие.

## Текущее состояние

**Стадия: Production, full scan nightly sync.**

- `globalVideoEmbeddings` — глобальная Firestore коллекция (~4400 видео, 36 каналов)
- Два типа embeddings: packaging (768d, текст) + visual (1408d, thumbnail image)
- Nightly sync: Cloud Scheduler (00:30 UTC) → self-chaining Cloud Tasks batches
- Budget safeguard: $5/month hard stop
- **Full scan** — каждую ночь проходит ВСЕ видео, проверяет актуальность, пересчитывает изменившиеся

## Roadmap

### Этап 0: Текущая архитектура (full scan) ← YOU ARE HERE

**User flow:** Автоматически, пользователь не видит. Каждую ночь pipeline проходит все ~4400 видео, читает embedding документ каждого, проверяет нужен ли пересчёт (новое видео, изменился title/tags, обновилась версия модели). Для 95%+ видео ответ "нет" — бесполезный Firestore read.

**Что работает:**
- Scheduled sync (00:30 UTC), self-chaining через Cloud Tasks
- Packaging embedding (gemini-embedding-001, 768d): title + tags + description
- Visual embedding (Vertex AI multimodalembedding@001, 1408d): thumbnail image
- Thumbnail description (Gemini Flash Vision): текстовое описание обложки
- Budget tracking + hard stop ($5/month)
- Model version stamping — bump `CURRENT_VERSION` для автоматической миграции всех embeddings
- `thumbnailUnavailable` sentinel — удалённые/приватные видео не ретраятся каждую ночь

**Проблемы:**
- ~4400 Firestore reads каждую ночь при ~150 реальных изменениях (3%)
- 45 Cloud Tasks + cold starts за ~5 минут при масштабе, который не требует batch chaining
- Не масштабируется: при 50K видео — 500 батчей, ~50 минут

### Этап 1: Инкрементальный sync

**User flow:** То же (автоматический, невидимый), но pipeline обрабатывает только изменившиеся видео.

**Идея:** Video sync (`scheduledTrendSnapshot`) уже знает, какие видео новые или изменились. При обновлении trendChannel видео — записывать ID в очередь `pendingEmbeddings`. Embedding sync читает только эту очередь.

- [ ] Коллекция или документ `system/pendingEmbeddings` — queue changed video IDs
- [ ] `scheduledTrendSnapshot` пишет в очередь при добавлении/обновлении видео
- [ ] `scheduledEmbeddingSync` читает только очередь, не full scan
- [ ] Weekly full scan как fallback (воскресенье) — ловит edge cases и миграции модели
- [ ] Удалить batch self-chaining для инкрементального режима (одна функция, без Cloud Tasks)

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
  embeddingSync.ts            # Channel discovery logic
  scheduledEmbeddingSync.ts   # Cloud Scheduler entry point (thin launcher)
  embeddingSyncBatch.ts       # Self-chaining batch processor
  backfillEmbeddings.ts       # One-time backfill (same pattern)
  budgetTracker.ts            # $5/month hard stop
  taskQueue.ts                # Cloud Tasks helper + pLimit
```

### Firestore коллекции

- `globalVideoEmbeddings/{youtubeVideoId}` — embedding документы (content-addressable, shared between users)
- `system/embeddingBudget` — monthly cost tracking
- `system/syncState` — batch orchestration state (video list, progress)
- `system/embeddingStats` — coverage statistics (written by sync as side-effect)

### Ключевые решения

- **`sddefault` исключён из thumbnail fallback** — формат 4:3, YouTube добавляет чёрные letterbox полосы для 16:9 видео, что "отравляет" visual embedding (cosine similarity падает с ~0.78 до ~0.54)
- **Fallback chain: `maxresdefault` → `mqdefault`** — оба 16:9, консистентное кадрирование важнее разрешения
- **`FieldValue.vector()`** для хранения embeddings — нативный Firestore vector тип для `findNearest()`
- **Budget per-video cost = $0.00024** (packaging ~$0.00004 + description ~$0.0001 + visual ~$0.0001)
