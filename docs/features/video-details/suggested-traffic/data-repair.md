# Data Enrichment

## Текущее состояние

**Реализовано.** CSV enrichment через YouTube API, cache-first архитектура. Единая модалка "Enrich Video Data" открывается при загрузке CSV с бедными данными (missing titles или unenriched) И при попытке включить Smart Assistant. Модалка объясняет, зачем нужны данные: Smart Assistant (ниши, типы трафика) и AI Analysis (теги, каналы, self-channel detection). Unfindable видео сохраняются как stubs и не блокируют функциональность.

---

## Что это

CSV из YouTube Analytics содержит только базовые метрики (views, impressions, CTR) и video ID. Без обогащения через YouTube API — нет channelId, channelTitle, thumbnail, tags, description. Smart Assistant не может классифицировать ниши без channelId (Harmonic Decay Scoring считает частоту каналов). AI Analysis tool (`analyzeSuggestedTraffic`) без enrichment не может делать content analysis и channel grouping.

**Аналогия:** представь, что у тебя есть список номеров телефонов, но без имён контактов. Ты можешь их видеть, но не можешь понять "кто мне чаще всего звонит". Enrichment — это как синхронизация контактов: по номеру (videoId) система узнаёт имя канала (channelId) и всё остальное.

---

## Два типа "бедности" данных

| Тип | Признак | Критичность | Когда появляется |
|-----|---------|-------------|------------------|
| **Missing Title** | Пустой `sourceTitle` | Высокая — видео не отображается нормально в таблице | Старый/кривой CSV формат |
| **Unenriched** | Есть title, но нет `channelId` ни в CSV, ни в кэше | Средняя — таблица работает, но Smart Assistant и AI Analysis ограничены | Свежий CSV, ещё не прошёл enrichment |

Missing Title подразумевает Unenriched (если нет даже заголовка — channelId тем более нет). `classifySources()` — SSOT для классификации: categories missing/unenriched/enriched/unresolvable.

---

## User flow

```
CSV загружен (upload) / данные загружены из Firestore
    |
    v
computeEnrichmentStats(): classifySources() → stats
    |
    +-- needsEnrichment: missingCount > 0 OR unenrichedCount > 0
    |
    v
[needsEnrichment?]
    |           |
    YES         NO
    |           |
    v           v
EnrichmentModal    CSV uploaded / data displayed
"Enrich Video Data"
    |
    +-- "X videos are missing titles and channel info"
    +-- "Required for: Smart Assistant + AI Analysis"
    +-- "Without enrichment, these features will have limited or no results"
    +-- Estimated API quota cost
    |
    v
User: Skip / Enrich
    |
    v (Enrich)
enrichSources()
    |
    +-- 1. filterIdsToFetch() — cache-first, skip enriched + unfindable
    +-- 2. fetchVideosBatch() — YouTube API batch (50 per request)
    +-- 3. persistEnrichmentToCache() — Firestore cached_external_videos
    +-- 4. mergeSources() — priority: fetched > cached > original
    |
    v
Enriched CSV → Cloud Storage + Firestore snapshot metadata
```

### Триггеры модалки

| Триггер | Когда | Можно Skip? |
|---------|-------|-------------|
| **CSV upload** | При загрузке CSV с бедными данными (pre-upload check) | Да — CSV загружается as-is |
| **Existing data load** | При открытии snapshot с бедными данными (auto-open) | Да — модалка закрывается |
| **Smart Assistant toggle** | При попытке включить, если `needsEnrichment` | Да — ассистент не включится |

Одна модалка, одно сообщение, три точки входа.

---

## Cache-first архитектура

Система НЕ бежит сразу в YouTube API. Перед каждым запросом проверяется кэш:

```
displayedSources (videoIds из CSV)
    |
    v
useExternalVideoLookup
    |-- Для каждого videoId: Firestore GET cached_external_videos/{videoId}
    |-- React Query cache: staleTime = Infinity
    |-- Результат: suggestedVideoMap
    |
    v
allVideos = homeVideos + suggestedVideoMap
    |
    v
classifySources(sources, allVideos) → classification
    |
    v
filterIdsToFetch(uniqueIds, allVideos) → cache misses only
    |
    v
YouTube API вызывается ТОЛЬКО для cache misses
```

**Экономия:** если видео X появилось в снапшоте #1 и было обогащено — в снапшоте #2 оно подтянется из кэша бесплатно (0 API units).

---

## Roadmap

### Текущее состояние ← YOU ARE HERE
- [x] `classifySources()` — SSOT pure function для классификации sources
- [x] `computeEnrichmentStats()` — SSOT для detection + quota estimation
- [x] `enrichSources()` — SRP orchestrator (fetch + persist + merge)
- [x] `EnrichmentModal` — единая модалка без variant hack
- [x] Enrichment trigger при CSV upload (pre-upload check)
- [x] Enrichment trigger при загрузке existing data (auto-open)
- [x] Smart Assistant gatekeeper (блокировка активации)
- [x] Cache-first: `useExternalVideoLookup` → `cached_external_videos`
- [x] Unfindable video stubs (`notFoundInApi: true` в `VideoDetails` interface)
- [x] Thumbnail error fallback

---

## Связанные фичи
- [Suggested Traffic (README)](./README.md) — основной док фичи
- [Traffic Sources](../traffic-sources.md) — агрегированные метрики по источникам
- [analyzeSuggestedTraffic Tool](../../chat/tools/layer-3-analysis/2-analyze-suggested-traffic-tool.md) — AI-тул потребляет обогащённые данные из `cached_external_videos`

---

## Technical Implementation

### Ключевые файлы

| Файл | Назначение |
|------|-----------|
| `pages/Details/tabs/Traffic/utils/enrichment.ts` | Pure functions: `classifySources()`, `computeEnrichmentStats()`, `mergeSources()`, `filterIdsToFetch()`, `isTitleMissing()` |
| `pages/Details/tabs/Traffic/hooks/useEnrichmentGate.ts` | Hook: detection (via `computeEnrichmentStats`) + `enrichSources()` orchestrator |
| `pages/Details/tabs/Traffic/hooks/useExternalVideoLookup.ts` | Per-document Firestore lookup + React Query cache |
| `pages/Details/tabs/Traffic/modals/EnrichmentModal.tsx` | Unified modal: explains Smart Assistant + AI Analysis benefits |
| `pages/Details/tabs/Traffic/components/TrafficModals.tsx` | Modal orchestrator (ColumnMapper + Enrichment) |
| `core/services/videoService.ts` | `batchUpdateExternalVideos()` — запись в кэш |
| `core/utils/youtubeApi.ts` | `fetchVideosBatch()` — YouTube API batch call, `VideoDetails.notFoundInApi` field |

### Architecture: Pure Functions + I/O Orchestrator

```
enrichment.ts (pure — no I/O, no side effects):
  classifySources(sources, cache) → { missing[], unenriched[], enriched[], unresolvable[] }
  computeEnrichmentStats(sources, cache) → { missingCount, unenrichedCount, needsEnrichment, toFetchCount, estimatedQuota }
  mergeSources(sources, fetchedMap, cache) → TrafficSource[]
  filterIdsToFetch(videoIds, cache) → string[]
  isTitleMissing(source) → boolean

useEnrichmentGate.ts (I/O orchestrator):
  batchLookupCachedVideos(videoIds, userId, channelId) → VideoDetails[]
    └── Firestore batch read (chunks of 100) before modal for accurate quota count
  enrichSources(sources, userId, channelId, apiKey, cache) → TrafficSource[]
    └── filterIdsToFetch() → fetchVideosBatch() → persistEnrichmentToCache() → mergeSources()
  useEnrichmentGate(props) → { ...stats, runEnrichment, isEnriching }
```

### Tests
| Файл | Кейсов |
|------|--------|
| `pages/Details/tabs/Traffic/utils/__tests__/enrichment.test.ts` | 33 (classifySources: 10, computeEnrichmentStats: 10, mergeSources: 8, filterIdsToFetch: 5) |

### Data paths

```
Firestore cache:  users/{uid}/channels/{channelId}/cached_external_videos/{videoId}
React Query key:  ['externalVideo', userId, channelId, videoId]  (staleTime: Infinity)
```
