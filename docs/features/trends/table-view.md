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

## computeVideoDeltas — Утилита для AI Chat

`computeVideoDeltas()` — pure async функция, извлечённая из React-контекста для переиспользования в chat middleware (enrichment middleware в chatStore.sendMessage).

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
2. Для каждого relevant channel параллельно запрашивает snapshots (32 дня)
3. Находит snapshots для 24h/7d/30d назад
4. Вычисляет дельты: `current - past`
5. Возвращает `Map<videoId, VideoDeltaStats>`

```typescript
interface VideoDeltaStats {
  delta24h: number | null;
  delta7d: number | null;
  delta30d: number | null;
  currentViews: number;
}
```

---

## Technical Implementation

### Файлы

| Файл | Назначение |
|------|-----------|
| `src/pages/Trends/Table/TrendsTable.tsx` | Основной компонент таблицы |
| `src/pages/Trends/Table/TrendsVideoRow.tsx` | Строка видео + `DeltaValue` component |
| `src/pages/Trends/hooks/useTrendTableData.ts` | Video-level data + snapshots + deltas |
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

`limitDays = 60` в table hooks (30d delta + запас). `limitDays = 32` в `computeVideoDeltas` (30d + buffer).
