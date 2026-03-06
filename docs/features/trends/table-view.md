# Trends — Table View & Delta System

> Табличное представление видео конкурентов с метриками роста.

## Что это такое

**Аналогия:** Биржевая таблица, но вместо акций — видео конкурентов. Вместо цены — просмотры. Вместо изменения цены — рост просмотров за последние 24 часа, 7 дней и 30 дней. Зелёные числа = рост, красные = падение.

## Два режима таблицы

### All Channels (обзор)
Когда `selectedChannelId = null` — показывает агрегированную статистику по каналам:

| Колонка | Описание |
|---------|----------|
| Channel | Аватар + название канала |
| Videos | Количество видео |
| Total Views | Сумма просмотров всех видео канала |
| Last 24h | Суммарный рост за 24 часа |
| Last 7d | Суммарный рост за 7 дней |
| Last 30d | Суммарный рост за 30 дней |

**Drill-down:** клик по каналу → переход в Single Channel с переносом фильтров.

### Single Channel (детализация)
Когда выбран конкретный канал — показывает каждое видео:

| Колонка | Описание |
|---------|----------|
| ☑️ | Checkbox для выделения |
| Video | Thumbnail + заголовок + канал |
| Published | Дата публикации |
| Total Views | Текущие просмотры |
| Last 24h | Рост за 24 часа |
| Last 7d | Рост за 7 дней |
| Last 30d | Рост за 30 дней |

## Delta System (Snapshot-Based Deltas)

### Как считаются дельты

Дельта — это разница между текущими просмотрами и просмотрами в "снимке" прошлого.

```
delta24h = currentViews - views_from_snapshot_24h_ago
delta7d  = currentViews - views_from_snapshot_7d_ago
delta30d = currentViews - views_from_snapshot_30d_ago
```

### Источник данных: Snapshots

Каждый синк (daily auto или manual) создаёт snapshot — документ в Firestore:

```
trendChannels/{channelId}/snapshots/{timestamp}
{
  timestamp: 1709596800000,
  videoViews: {
    "dQw4w9WgXcQ": 1500000000,
    "abc123def45": 250000,
    ...
  },
  videoCount: 342,
  type: "auto"
}
```

`videoViews` — это Map: videoId → viewCount на момент снимка.

### Алгоритм поиска снимка

```
findSnapshot(targetTimestamp):
  snapshots отсортированы по timestamp DESC
  return первый snapshot, где snapshot.timestamp <= targetTimestamp
```

Пример: сейчас 5 марта 12:00. Ищем snapshot для 24h:
- target = 4 марта 12:00
- Находим snapshot от 4 марта 00:00 (ближайший, не новее target)
- delta24h = текущие views - views из этого snapshot

### Null vs Zero

- `null` — снимка нет (канал ещё не синкался достаточно долго, или видео появилось позже снимка)
- `0` — снимок есть, но просмотры не изменились
- В UI `null` показывается как прочерк (`-`), `0` как `0`

### Smart Default Sort

При загрузке данных:
- Если **есть** хотя бы одно видео с `delta24h !== null` → сортировка по `delta24h DESC`
- Если **нет** данных о дельтах → fallback на `publishedAt DESC` (video mode) или `totalViews DESC` (channel mode)

Это предотвращает ситуацию, когда таблица сортирована по дельтам, но все значения = прочерк.

## Totals Row

Первая строка таблицы — сводная:
- **Video mode:** сумма viewCount, сумма delta24h/7d/30d по всем видео
- **Channel mode:** сумма totalViews, videoCount, delta24h/7d/30d по всем каналам

## Selection & Integration

- **Checkboxes** — в video mode, additive selection
- **Select All** — checkbox в header (с indeterminate state)
- **Row click** — выделение (с поддержкой Cmd/Ctrl для множественного)
- **Context bridge** — выбранные видео передаются в AI-чат через `useTrendsContextBridge`

## DeltaValue Component

Компонент визуализации дельты:
- Положительное значение → зелёный текст с `+` префиксом
- Отрицательное → красный текст
- Ноль → серый `0`
- Null → серый прочерк `-`

Числа форматируются в compact notation: `1500000` → `1.5M`.

## Shared Algorithm — `calculateViewDeltas()`

Алгоритм вычисления дельт вынесен в **`shared/viewDeltas.ts`** — единый источник правды (SSOT), используемый и фронтендом, и бэкендом. Экспортирует:

- `calculateViewDeltas(snapshots, videoIds)` — pure function, вычисляет дельты по массиву snapshots
- `VideoDeltaStats` — интерфейс результата
- `DELTA_SNAPSHOT_DAYS = 35` — единая константа лимита snapshot'ов (30d + запас)

```typescript
interface VideoDeltaStats {
  delta24h: number | null;
  delta7d: number | null;
  delta30d: number | null;
  currentViews: number;
}
```

## computeVideoDeltas — I/O-обёртка для AI Chat

`computeVideoDeltas()` — async I/O-обёртка, которая загружает snapshot'ы из Firestore и делегирует вычисления в `calculateViewDeltas()` из `shared/viewDeltas.ts`. Используется в chat middleware (enrichment pipeline в `chatStore.sendMessage`), то есть вне React-контекста.

### Параметры

| Параметр | Тип | Описание |
|----------|-----|----------|
| `videoIds` | `string[]` | YouTube video IDs (11 символов) |
| `trendChannels` | `TrendChannel[]` | Каналы для поиска snapshots |
| `userId` | `string` | Firebase user ID |
| `channelId` | `string` | Active user channel ID |
| `channelIdHints?` | `Set<string>` | Опциональный фильтр по каналам (сужает lookup) |

### Логика

1. Фильтрует невалидные video IDs (regex `^[a-zA-Z0-9_-]{11}$`)
2. Для каждого relevant channel параллельно запрашивает snapshots (`DELTA_SNAPSHOT_DAYS` дней)
3. Делегирует в `calculateViewDeltas()` — поиск snapshot'ов для 24h/7d/30d и вычисление дельт
4. Возвращает `Map<videoId, VideoDeltaStats>`

---

## Technical Implementation

### Файлы

| Файл | Назначение |
|------|-----------|
| `src/pages/Trends/Table/TrendsTable.tsx` | Основной компонент таблицы |
| `src/pages/Trends/Table/TrendsVideoRow.tsx` | Строка видео + `DeltaValue` component |
| `shared/viewDeltas.ts` | SSOT: `calculateViewDeltas()`, `VideoDeltaStats`, `DELTA_SNAPSHOT_DAYS` |
| `src/core/hooks/useTrendSnapshots.ts` | TanStack Query cache for trend snapshots (per-channel) |
| `src/pages/Trends/hooks/useTrendTableData.ts` | Video-level data; uses `useTrendSnapshots()` cache + `calculateViewDeltas()` |
| `src/pages/Trends/hooks/useTrendChannelTableData.ts` | Channel-level aggregation |
| `src/core/utils/computeVideoDeltas.ts` | Reusable delta computation (outside React) |
| `src/core/types/trends.ts` | `TrendVideoRow`, `TrendChannelRow`, `TrendSortConfig`, `TrendTotals` |
| `src/pages/Trends/utils/formatters.ts` | `formatNumber` (compact), `formatDuration` |

### Type Hierarchy

```typescript
TrendRow = TrendVideoRow | TrendChannelRow

TrendVideoRow {
  type: 'video'
  video: TrendVideo
  delta24h: number | null
  delta7d: number | null
  delta30d: number | null
}

TrendChannelRow {
  type: 'channel'
  channel: TrendChannel
  videoCount: number
  totalViews: number
  delta24h: number | null
  delta7d: number | null
  delta30d: number | null
}

TrendSortKey = 'title' | 'publishedAt' | 'viewCount' | 'totalViews'
             | 'videoCount' | 'delta24h' | 'delta7d' | 'delta30d'
```

### Snapshot Query

```typescript
TrendService.getTrendSnapshots(userId, channelId, trendChannelId, limitDays)
// → query(ref, orderBy('timestamp', 'desc'), limit(limitDays))
// Возвращает TrendSnapshot[] отсортированные DESC (newest first)
```

Лимит snapshot'ов унифицирован: `DELTA_SNAPSHOT_DAYS = 35` из `shared/viewDeltas.ts` — используется и в table hooks (через `useTrendSnapshots()`), и в `computeVideoDeltas()` (AI middleware).
