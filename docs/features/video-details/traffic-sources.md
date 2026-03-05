# 📈 Traffic Sources — Feature Doc

## Текущее состояние

**Stage 1 MVP реализован.** Таб Traffic Sources добавлен в Video Details page. CSV upload (drag & drop), auto-naming ("13 hours", "3 days"), sidebar timeline, sortable table с 6 колонками, cumulative/delta toggle. Общие CSV утилиты переиспользуются между Traffic Sources и Suggested Traffic.

---

## Что это

Модуль для отслеживания **динамики источников трафика** видео во времени. Пользователь периодически скачивает CSV из YouTube Analytics (Traffic Source report) и загружает в приложение. Каждая загрузка = snapshot. Серия snapshot'ов показывает, как менялись impressions, CTR, views для каждого источника трафика.

**Ключевой вопрос, на который отвечает:** *"YouTube дал моему видео 840 impressions через Suggested videos за первые 13 часов, CTR 2.3%. Через 3 дня impressions выросли до 5,200 — значит YouTube усиливает рекомендации."*

### Отличие от Suggested Traffic

| | **Traffic Sources (новая фича)** | **Suggested Traffic (существующая)** |
|---|---|---|
| **Вопрос** | Откуда приходит трафик? | Рядом с какими видео YouTube рекомендует моё? |
| **Данные** | Агрегированные метрики по источникам | Конкретные видео (с video ID) |
| **Строк** | ~6-8 (Suggested, Browse, Search...) | 50-500 (каждое видео отдельно) |
| **Основная ценность** | Динамика метрик во времени | Анализ конкурентного окружения |

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

### Стадия 1 — MVP: Upload + Table ✅
Загрузка CSV, отображение в таблице, sidebar с timeline snapshot'ов.
- [x] Новый таб `trafficSource` в Details page (над `traffic`)
- [x] CSV parser: `trafficSourceParser.ts` с auto-detect + shared `csvUtils.ts` + Column Mapper fallback
- [x] Snapshot storage: CSV → Cloud Storage, metadata → Firestore (`trafficSource/main`)
- [x] Auto-naming: `autoLabel.ts` — parse `publishedAt` → `"13 hours"`, `"3 days"`. Fallback на дату. Rename через sidebar
- [x] Sidebar: `TrafficSourceNav` — timeline list с inline rename и delete
- [x] Table View: `TrafficSourceTable` — sortable, 6 колонок, delta badges
- [x] Total Row display (sticky сверху)
- [x] Cumulative / Delta toggle (delta доступен при 2+ snapshot'ах)
- [x] Column Mapper modal wiring — `TrafficSourceColumnMapperModal.tsx` (fallback для нестандартных CSV)
- [x] Shared `CsvDropZone` молекула — `ui/molecules/CsvDropZone.tsx` (используется в TrafficUploader + TrafficSourceTab)

### Стадия 2 — Delta Mode ← YOU ARE HERE
Сравнение между snapshot'ами: что изменилось.
- [x] Toggle cumulative / delta — кнопки в `TrafficSourceTab.tsx`
- [x] Delta = current snapshot - previous snapshot — `useTrafficSourceDataLoader.ts`
- [x] Color coding: зелёный = рост, красный = падение — `DeltaBadge` компонент
- [x] "First snapshot" handling — `canDelta` делает кнопку delta неактивной при < 2 snapshot'ах

### Стадия 3 — Chat Bridge
Передача snapshot'ов в AI чат для анализа вместе с контекстом видео.
- [ ] Bridge: выбранный snapshot → `appContextStore` (новый слот `sources`)
- [ ] Context включает: дату snapshot, время с публикации, metrics по каждому source
- [ ] AI может анализировать: *"CTR на Suggested 2.3% — это ниже среднего для music niche, потому что обложка не привлекает внимание"*

### Стадия 4 — Charts
Визуализация динамики метрик по всем snapshot'ам.
- [ ] Line chart: Impressions over time (ось X = snapshots, Y = impressions)
- [ ] Line chart: CTR over time
- [ ] Line chart: Views over time
- [ ] Line chart: AVD over time
- [ ] Stacked area: breakdown по источникам (Suggested + Browse + Search + ...)
- [ ] Hover tooltip с деталями snapshot

### Стадия 5 — Full Context Toggle
Возможность передать ВСЮ историю snapshot'ов в AI chat.
- [ ] Toggle в ChatInput context: "Включить Traffic Sources history"
- [ ] При выделении видео на Home/Playlist page → toggle для передачи всех snapshot'ов
- [ ] AI видит серию snapshot'ов → может анализировать тренды: *"Impressions растут линейно, CTR стабилен → YouTube масштабирует"*

### 🚀 Production
**User flow:** Пользователь публикует видео. Через 13 часов загружает первый Traffic Sources CSV. Через 3 дня — второй. Через неделю — третий. Sidebar показывает: `"13 hours" → "3 days" → "1 week"`. Charts показывают рост Impressions и динамику CTR. AI анализирует: *"YouTube начал давать больше Browse трафика после третьего дня — это знак, что видео попадает в Home feed"*.

- [ ] **Архитектура:** Таб в Details, Cloud Storage + Firestore (по аналогии с Suggested Traffic)
- [ ] **Стоимость:** Минимальная — CSV upload + Firestore writes. Нет YouTube API calls
- [ ] **Хранение:** Cloud Storage (CSV body) + Firestore (snapshot metadata + computed time-since-publish)
- [ ] **API:** Нет внешних API. Только local parsing
- [ ] **Charts:** Lightweight chart lib (recharts / visx / chart.js)

---

## Что можно переиспользовать от Suggested Traffic

| Компонент | Можно переиспользовать? | Адаптация |
|-----------|:-----------------------:|-----------|
| `csvParser.ts` | ⚡ Частично | Другие колонки, другой формат. Но `detectMapping()` + `parseLine()` переиспользуются |
| `snapshotLoader.ts` | ✅ Полностью | Тот же Cloud Storage → parse цикл |
| `snapshotCache.ts` | ✅ Полностью | LRU кэш для immutable snapshots |
| Sidebar UI (`SidebarNavItem`) | ✅ Полностью | Тот же список snapshot'ов |
| `useTrafficDataLoader.ts` | ⚡ Частично | Delta calculation переиспользуется, но данные проще |
| TrafficTable | ⚡ Частично | 6 колонок вместо 10+, нет video IDs, нет enrichment |
| Chat Bridge pattern | ✅ Полностью | Тот же `setSlot` + sticky behavior |
| Canvas integration | ❌ Нет | Traffic Sources не имеют video IDs → нет canvas nodes |

---

## Связанные фичи
- [Suggested Traffic](./suggested-traffic.md) — Другой CSV: конкретные видео. Разделяют sidebar UI и Storage паттерн
- [Chat](./chat.md) — Sources Bridge передаёт snapshot данные в чат (новый слот `sources`)
- [Video Details](./video-details.md) — Traffic Sources живёт как таб внутри Details page

## Техническая заметка (для агента)
**Таб:** `pages/Details/tabs/TrafficSource/` — `TrafficSourceTab.tsx`, компоненты, хуки, утилиты
**Sidebar:** `pages/Details/Sidebar/TrafficSource/TrafficSourceNav.tsx`
**Service:** `core/services/TrafficSourceService.ts` — Firestore CRUD + Cloud Storage upload
**Types:** `core/types/trafficSource.ts` — `TrafficSourceMetric`, `TrafficSourceSnapshot`, `TrafficSourceData`
**Shared CSV:** `core/utils/csvUtils.ts` — `parseCsvLine`, `detectColumnMapping`, `cleanCsvField`
**URL routing:** `?tab=trafficSource` в `DetailsLayout.tsx`
**Tab type union:** `'packaging' | 'trafficSource' | 'traffic' | 'gallery' | 'editing'`
**Firestore path:** `users/{uid}/channels/{channelId}/videos/{videoId}/trafficSource/main`
**Cloud Storage:** `users/{uid}/channels/{channelId}/videos/{videoId}/trafficSource/{snapshotId}.csv`
