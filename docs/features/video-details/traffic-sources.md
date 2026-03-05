# Traffic Sources — Feature Doc

## Текущее состояние

**Stages 1-3 реализованы.** Таб Traffic Sources в Video Details page: CSV upload (drag & drop), auto-naming ("13 hours", "3 days"), sidebar timeline, sortable table с 6 колонками, cumulative/delta toggle. AI-анализ доступен on-demand через tool `analyzeTrafficSources` — AI сам скачивает все snapshot'ы, строит per-source timelines с pre-computed deltas и интерпретирует тренды. Общие CSV утилиты переиспользуются между Traffic Sources и Suggested Traffic.

**Snapshot count denormalization:** `trafficSourceSnapshotCount` записывается на документ видео при каждом create/delete снэпшота и при входе в Traffic Sources таб (lazy sync). `getMultipleVideoDetails` пробрасывает это поле для own-видео, а tool description указывает LLM проверять его перед вызовом.

---

## Что это

Модуль для отслеживания **динамики источников трафика** видео во времени. Пользователь периодически скачивает CSV из YouTube Analytics (Traffic Source report) и загружает в приложение. Каждая загрузка = snapshot. Серия snapshot'ов показывает, как менялись impressions, CTR, views для каждого источника трафика.

**Ключевой вопрос, на который отвечает:** *"YouTube дал моему видео 840 impressions через Suggested videos за первые 13 часов, CTR 2.3%. Через 3 дня impressions выросли до 5,200 — значит YouTube усиливает рекомендации."*

### Отличие от Suggested Traffic

| | **Traffic Sources** | **Suggested Traffic** |
|---|---|---|
| **Вопрос** | Откуда приходит трафик? | Рядом с какими видео YouTube рекомендует моё? |
| **Данные** | Агрегированные метрики по источникам | Конкретные видео (с video ID) |
| **Строк** | ~6-8 (Suggested, Browse, Search...) | 50-500 (каждое видео отдельно) |
| **Основная ценность** | Динамика метрик во времени | Анализ конкурентного окружения |
| **AI-тул** | `analyzeTrafficSources` (gateway) | `analyzeSuggestedTraffic` (drill-down) |
| **Связь** | Вызывается ПЕРВЫМ — показывает общую картину | Вызывается ПОСЛЕ — если Suggested доминирует, AI drill-down'ит в конкретные видео |

### CSV формат
```
Traffic source,Views,Watch time (hours),Average view duration,Impressions,Impressions click-through rate (%)
Total,36,6.9541,0:11:35,840,2.5
Suggested videos,22,4.0417,0:11:01,684,2.34
Browse features,7,1.0528,0:09:01,151,3.31
Notifications,6,1.4884,0:14:53,,
Other YouTube features,1,0.3713,0:22:16,,
YouTube search,0,0,,4,0
Channel pages,,,,1,0
```

---

## Roadmap

### Stage 1 — MVP: Upload + Table ✅
Загрузка CSV, отображение в таблице, sidebar с timeline snapshot'ов.
- [x] Новый таб `trafficSource` в Details page (над `traffic`)
- [x] CSV parser: auto-detect + shared `csvUtils` + Column Mapper fallback
- [x] Snapshot storage: CSV → Cloud Storage, metadata → Firestore
- [x] Auto-naming: parse `publishedAt` → `"13 hours"`, `"3 days"`. Fallback на дату. Rename через sidebar
- [x] Sidebar: timeline list с inline rename и delete
- [x] Table View: sortable, 6 колонок, delta badges
- [x] Total Row display (sticky сверху)
- [x] Cumulative / Delta toggle (delta доступен при 2+ snapshot'ах)
- [x] Column Mapper modal — fallback для нестандартных CSV
- [x] Shared `CsvDropZone` молекула — используется в TrafficUploader + TrafficSourceTab

### Stage 2 — Delta Mode ✅
Сравнение между snapshot'ами: что изменилось.
- [x] Toggle cumulative / delta
- [x] Delta = current snapshot - previous snapshot
- [x] Color coding: зелёный = рост, красный = падение (DeltaBadge + DeltaCell)
- [x] "First snapshot" handling — `canDelta` делает кнопку delta неактивной при < 2 snapshot'ах

### Stage 3 — AI Tool (on-demand analysis) ✅
AI-ассистент анализирует traffic sources через dedicated tool — данные не раздувают контекст by default.
- [x] Server-side tool `analyzeTrafficSources` — читает Firestore, скачивает все CSV'ы, парсит, строит timelines
- [x] Server-side CSV parser (порт фронтенд-парсера, без browser API)
- [x] Timeline builder: per-source trajectories с pre-computed deltas между snapshot'ами
- [x] Gateway-паттерн: AI вызывает `analyzeTrafficSources` ПЕРВЫМ, затем drill-down через `analyzeSuggestedTraffic`
- [x] Tool registered в definitions.ts + executor.ts (provider-agnostic)
- [x] Client-side formatter `formatTrafficSourcesCompact` — compact multi-line summary (утилита, не в pipeline)

### Stage 4 — Charts ← YOU ARE HERE
Визуализация динамики метрик по всем snapshot'ам.
- [ ] Line chart: Impressions over time (ось X = snapshots, Y = impressions)
- [ ] Line chart: CTR over time
- [ ] Line chart: Views over time
- [ ] Line chart: AVD over time
- [ ] Stacked area: breakdown по источникам (Suggested + Browse + Search + ...)
- [ ] Hover tooltip с деталями snapshot

### Production
**User flow:** Пользователь публикует видео. Через 13 часов загружает первый Traffic Sources CSV. Через 3 дня — второй. Через неделю — третий. Sidebar показывает: `"13 hours" → "3 days" → "1 week"`. Delta mode показывает рост Impressions и динамику CTR. AI анализирует on-demand: *"YouTube начал давать больше Browse трафика после третьего дня — это знак, что видео попадает в Home feed"*. Charts визуализируют тренды.

- [ ] **Charts:** Lightweight chart lib (recharts / visx / chart.js)
- [x] **Архитектура:** Таб в Details (frontend), AI tool (backend), Cloud Storage + Firestore
- [x] **Стоимость:** Минимальная — CSV upload + Firestore writes. Нет YouTube API calls
- [x] **Хранение:** Cloud Storage (CSV body) + Firestore (snapshot metadata + computed time-since-publish)
- [x] **AI:** On-demand через tool — 0 tokens в контексте по умолчанию, полный анализ по запросу

---

## Что переиспользуется с Suggested Traffic

| Компонент | Переиспользуется? | Адаптация |
|-----------|:-----------------------:|-----------|
| Shared `csvUtils.ts` | ✅ Полностью | `parseCsvLine()`, `detectColumnMapping()`, `cleanCsvField()` |
| Snapshot loader + LRU cache | ✅ Полностью | Тот же Cloud Storage → parse → cache цикл |
| Sidebar UI (SidebarNavItem) | ✅ Полностью | Тот же список snapshot'ов |
| Delta calculation pattern | ✅ Концептуально | Свой `delta.ts`, но тот же подход (current - previous) |
| AI tool pattern | ✅ Концептуально | Свой handler, но тот же паттерн: Firestore → Cloud Storage → parse → structured JSON |
| Canvas integration | ❌ Нет | Traffic Sources не имеют video IDs → нет canvas nodes |

---

## Связанные фичи
- [Suggested Traffic](./suggested-traffic/) — другой CSV (конкретные видео). Разделяют sidebar UI, Storage паттерн, и AI tool gateway-цепочку
- [Telescope Pattern Overview](../chat/tools/README.md) — `analyzeTrafficSources` входит в Telescope Pattern (Layer 3 — gateway tool)
- Video Details — Traffic Sources живёт как таб внутри Details page

---

## Technical Implementation

### Frontend
| Файл | Назначение |
|------|-----------|
| `pages/Details/tabs/TrafficSource/TrafficSourceTab.tsx` | Главный таб: CSV upload, view mode toggle, table |
| `pages/Details/tabs/TrafficSource/components/TrafficSourceTable.tsx` | Sortable table: 6 колонок, sticky total, DeltaCell |
| `pages/Details/tabs/TrafficSource/hooks/useTrafficSourceData.ts` | I/O хук: Firestore fetch, CSV upload, delete, refetch |
| `pages/Details/tabs/TrafficSource/hooks/useTrafficSourceDataLoader.ts` | Loader: скачивает CSV, парсит, считает delta |
| `pages/Details/tabs/TrafficSource/modals/TrafficSourceColumnMapperModal.tsx` | Fallback column mapping UI |
| `pages/Details/Sidebar/TrafficSource/TrafficSourceNav.tsx` | Sidebar: timeline list, inline rename, delete |
| `core/services/suggestedTraffic/TrafficSourceService.ts` | Firestore CRUD + Cloud Storage upload |
| `core/types/suggestedTraffic/trafficSource.ts` | `TrafficSourceMetric`, `TrafficSourceSnapshot`, `TrafficSourceData`, `SnapshotWithMetrics` |
| `core/utils/trafficSource/parser.ts` | Client-side CSV parser (auto-detect EN + RU headers) |
| `core/utils/trafficSource/snapshotLoader.ts` | Cloud Storage download + LRU cache (max 20) |
| `core/utils/trafficSource/delta.ts` | Delta calculation + `TrafficSourceDeltaMetric` type |
| `core/ai/utils/formatTrafficSources.ts` | Compact text formatter для AI context (utility) |
| `features/Canvas/nodes/TrafficSourceNode.tsx` | Canvas node (инфраструктура, не подключён) |

### Backend (Cloud Functions)
| Файл | Назначение |
|------|-----------|
| `functions/src/services/tools/handlers/analyzeTrafficSources.ts` | Tool handler: Firestore → Cloud Storage → parse → timeline → JSON |
| `functions/src/services/tools/utils/trafficSourceCsvParser.ts` | Server-side CSV parser (Node.js, порт фронтенд-версии) |
| `functions/src/services/tools/utils/trafficSourceTimeline.ts` | Timeline builder: per-source trajectories + deltas |
| `functions/src/services/tools/definitions.ts` | Tool declaration (provider-agnostic) |
| `functions/src/services/tools/executor.ts` | Tool routing: `ANALYZE_TRAFFIC_SOURCES` → handler |

### Data paths
```
Firestore:  users/{uid}/channels/{channelId}/videos/{videoId}/trafficSource/main
Storage:    users/{uid}/channels/{channelId}/videos/{videoId}/trafficSource/{snapshotId}.csv
URL param:  ?tab=trafficSource
Tab union:  'packaging' | 'trafficSource' | 'traffic' | 'gallery' | 'editing'
```

### AI Tool: `analyzeTrafficSources`
```
User asks about traffic → LLM calls analyzeTrafficSources(videoId)
  → Handler reads trafficSource/main from Firestore
  → Downloads all snapshot CSVs in parallel from Cloud Storage
  → parseTrafficSourceCsv() parses each (server-side parser)
  → buildSourceTimeline() builds per-source trajectories with deltas
  → Returns structured JSON: { sourceVideo, snapshotTimeline, sources[], totalTimeline[] }
  → LLM interprets trends and responds
  → If Suggested dominates → LLM calls analyzeSuggestedTraffic for drill-down
```

### Tests
| Файл | Кейсов |
|------|--------|
| `functions/src/services/tools/handlers/__tests__/analyzeTrafficSources.test.ts` | 7 (validation, empty data, full pipeline, broken CSV, download failures) |
| `functions/src/services/tools/utils/__tests__/trafficSourceCsvParser.test.ts` | 10 (standard CSV, edge cases, RU headers, RFC 4180) |
| `functions/src/services/tools/utils/__tests__/trafficSourceTimeline.test.ts` | Timeline builder (multi-snapshot, deltas, gaps) |
| `src/core/utils/trafficSource/__tests__/delta.test.ts` | 5 (deltas, new sources, division by zero) |
| `src/core/ai/utils/__tests__/formatTrafficSources.test.ts` | 13 (empty, single, multi, top-5 cap, large numbers) |
