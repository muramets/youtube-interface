# Video View Deltas (24h / 7d / 30d)

> Кросс-фичовая система, показывающая рост просмотров видео конкурентов за последние сутки, неделю и месяц.

## Что это такое

**Аналогия:** У каждого видео конкурента есть "пульс" — как быстро оно набирает просмотры прямо сейчас. Число `+5.2K (24h)` означает, что за последние сутки это видео получило 5 200 новых просмотров. Три временных окна дают картину: спринт (24h), марафон (7d) и тренд (30d).

**Зачем:** Просмотры сами по себе ничего не говорят — видео с 1M views может быть мёртвым (вышло 3 года назад, 0 роста) или активным (+50K/сутки). Дельта показывает **динамику**, а не статику. Это позволяет быстро находить:
- Видео, которые "взлетают" прямо сейчас (высокий delta24h)
- Evergreen-контент (стабильный delta30d, низкий delta24h)
- Видео, которые затухают (delta24h ≈ 0, delta30d высокий)

## Текущее состояние

- [x] Расчёт дельт из Trend Snapshots
- [x] Отображение в Trends Table (24h/7d/30d колонки, totals row, smart sort)
- [x] Отображение в Suggested Traffic Table (tooltip при hover на Info icon)
- [x] Отображение в Playlist Details (суммарные дельты в header, сортировка по дельтам, per-video delta в VideoCard)
- [x] Enrichment для AI Chat (автоматическое обогащение контекста перед отправкой модели)
- [ ] Единый вычислитель (Trends Table использует свою inline-логику — дублирование)
- [ ] Кэширование (каждый потребитель делает свои Firestore-запросы)

## Источник данных: Trend Snapshots

Каждый синк канала (ежедневный автоматический или ручной) создаёт "снимок" просмотров — документ в Firestore:

```
users/{userId}/channels/{channelId}/trendChannels/{trendChannelId}/snapshots/{id}
```

Структура снимка:
- `timestamp` — момент создания (ms)
- `videoViews` — Map: `videoId → viewCount` на момент снимка
- `videoCount` — количество видео
- `type` — `"auto"` (cron) или `"manual"` (пользователь нажал Sync)

Снимки хранятся в порядке `timestamp DESC` (новейший первый).

## Алгоритм

### Формула

```
delta24h = currentViews - viewsFromSnapshot(closest to now - 24h)
delta7d  = currentViews - viewsFromSnapshot(closest to now - 7d)
delta30d = currentViews - viewsFromSnapshot(closest to now - 30d)
```

### Поиск снимка

Для каждого временного окна (24h, 7d, 30d) алгоритм ищет ближайший снимок **не новее** целевого момента:

```
target = now - 24 * 60 * 60 * 1000
snapshot = первый snapshot, где snapshot.timestamp <= target
```

Пример: сейчас 5 марта 12:00, ищем snapshot для 24h:
- target = 4 марта 12:00
- Находим snapshot от 4 марта 00:00 (ближайший, не новее target)
- delta24h = текущие views - views из этого snapshot

### Null vs Zero

- `null` — снимка нет (канал синкался недостаточно долго, или видео появилось позже снимка). UI показывает прочерк (`-`)
- `0` — снимок есть, но просмотры не изменились. UI показывает `0`

Это важное бизнес-различие: `null` = "мы не знаем", `0` = "рост отсутствует".

### currentViews: согласованность данных

`VideoDeltaStats` содержит поле `currentViews` — текущие просмотры **из того же snapshot-источника**, что и дельты. Это решает проблему рассинхрона:

- `video.viewCount` в Firestore обновляется только при ручном sync видео
- Trend snapshots обновляются независимо (daily cron)
- Если показывать `viewCount` из Firestore + delta из snapshot — числа будут математически несогласованны

Поэтому `VideoCard` приоритизирует `deltaStats.currentViews` над `video.viewCount`.

## Потребители

### 1. Trends Table

**Где:** `src/pages/Trends/Table/`

**Как получает данные:** Вычисляет дельту **самостоятельно** в `useTrendTableData.ts` — загружает snapshots напрямую через `TrendService.getTrendSnapshots()` и считает дельту inline. Алгоритм идентичен `computeVideoDeltas()`, но код дублирован.

**Почему не использует общий хук:** `useTrendTableData` уже имеет загруженные snapshots для построения таблицы, и на момент создания общего хука ещё не существовало.

**Что показывает:**
- Три колонки: Last 24h, Last 7d, Last 30d
- Totals row: сумма дельт по всем видео
- `DeltaValue` компонент: зелёный с `+` (рост), красный (падение), серый `0`, прочерк `-` (null)
- Числа в compact-нотации: `1500000` → `1.5M`
- Smart Default Sort: сортировка по `delta24h DESC` если есть данные, иначе fallback на `publishedAt DESC`

**Запрос:** 60 дней snapshots (30d delta + запас).

### 2. Suggested Traffic Table

**Где:** `src/pages/Details/tabs/Traffic/`

**Как получает данные:** `TrafficTab.tsx` вызывает `useVideoDeltaMap()` хук, передавая video IDs из текущих traffic sources. Результат (`deltaMap`) пробрасывается через `TrafficTable` → `TrafficRow` → `VideoPreviewTooltip`.

**Оптимизация channelIdHints:** TrafficTab извлекает `channelId` из каждого traffic source и передаёт как `channelIdHints` — это сужает запрос snapshots только до релевантных trend channels, вместо сканирования всех.

**Что показывает:** В `VideoPreviewTooltip` (появляется при hover на иконку ℹ️ рядом с названием видео) — три бейджа:
- `24h: +1.2K` (emerald/зелёный)
- `7d: +5.3K` (emerald, 80% opacity)
- `30d: +12K` (emerald, 60% opacity)

Отрицательные значения — orange. Бейджи скрыты если все три null.

### 3. Playlist Details Page (включая VideoCard)

**Где:** `src/pages/Playlists/PlaylistDetailPage.tsx`

**Как получает данные:** `usePlaylistDeltaStats()` — обёртка вокруг `useVideoDeltaMap()`:
1. Извлекает video IDs и channel IDs из videos плейлиста
2. Передаёт channel IDs как `channelIdHints` для оптимизации
3. Агрегирует per-video дельты в totals (суммы delta24h/7d/30d)
4. Считает `videosWithData` — сколько видео имеют snapshot-данные

**Что показывает:**
- **Header (PlaylistSubtitle):** агрегированные дельты, например `+2.5K (24h) · +15.3K (7d) · +45K (30d)`
- **Сортировка:** опции "Views (24h)", "Views (7d)", "Views (30d)" доступны только когда соответствующий `totals.deltaXX !== null`
- **VideoCard:** per-video `deltaStats` передаётся через `VideoGrid` → `VirtualVideoGrid` → `SortableVideoCard` → `VideoCard`

**VideoCard** (`src/features/Video/VideoCard.tsx`) принимает опциональный prop `deltaStats?: VideoDeltaStats`:
- **View count**: приоритет `deltaStats.currentViews` → fallback на `video.viewCount`
- **Inline delta**: `(+1.2K)` зелёным текстом рядом с views — показывает только `delta24h`

**Важно:** VideoCard получает дельту **только** в контексте Playlist Detail Page. На Home Page (`HomePage.tsx`) `VideoGrid` рендерится без `videoDeltaStats` — карточки показывают только `video.viewCount` без дельт.

### 5. AI Chat (Enrichment Pipeline)

**Где:** `src/core/ai/pipeline/enrichContextWithDeltas.ts`

**Как получает данные:** Вызывает `computeVideoDeltas()` напрямую (pure async function, без React):
1. Извлекает video IDs из `VideoCardContext` items в `appContextStore`
2. Читает `trendStore.channels` и `channelStore.currentChannel` императивно через `getState()`
3. Вычисляет дельты
4. Патчит items: добавляет `delta24h`, `delta7d`, `delta30d`
5. Graceful degradation: если нет snapshot-данных — items возвращаются без delta-полей

**Когда срабатывает:** Автоматически при каждой отправке сообщения в чат, как шаг `prepareContext()`:

```
appContextStore (raw items)
    ↓
prepareContext()
    ↓
enrichContextWithDeltas()     ← здесь
    ↓
mergeContextItems()
    ↓
persist to Firestore
    ↓
buildPersistentContextLayer() → System Prompt → AI Model
```

**Формат для модели** (в `persistentContextLayer.ts`):

```
- Competitor: "Video Title" [id: abc123] — Views: 150K | 24h: +1.2K / 7d: +5.3K / 30d: +12K | Published: 2024-01-15
```

**Зачем:** AI видит не только абсолютные просмотры, а динамику роста — может определить, растёт видео, стагнирует или затухает. Без дельт модели пришлось бы гадать о траектории.

## Data Flow (полная схема)

```
┌─────────────────────────────────────────┐
│          Trend Snapshots (Firestore)     │
│  trendChannels/{id}/snapshots/{ts}       │
│  { timestamp, videoViews: { id→count } } │
└──────────────┬──────────────────────────┘
               │
       ┌───────┴───────┐
       │               │
       ▼               ▼
  computeVideoDeltas()   useTrendTableData()
  (pure async utility)   (inline, дублированный алгоритм)
       │                        │
       │                        ▼
       │               ┌──────────────────┐
       │               │  Trends Table     │
       │               │  (24h/7d/30d      │
       │               │   колонки + totals)│
       │               └──────────────────┘
       │
  ┌────┴──────────────────────┐
  │                           │
  ▼                           ▼
useVideoDeltaMap()    enrichContextWithDeltas()
(React hook)          (AI pipeline middleware)
  │                           │
  ├──→ TrafficTab             ▼
  │      └→ TrafficTable    prepareContext()
  │          └→ TrafficRow    └→ persistentContextLayer
  │              └→ VideoPreviewTooltip   └→ System Prompt
  │
  └──→ usePlaylistDeltaStats()
         ├→ PlaylistSubtitle (aggregate header)
         ├→ Sort options (conditional)
         └→ VideoGrid → VirtualVideoGrid
              └→ SortableVideoCard
                   └→ VideoCard (currentViews + delta24h)
                      (ТОЛЬКО в Playlist Detail Page; на Home Page — без дельт)
```

## Пути оптимизации

### 1. Устранение дублирования: Trends Table → computeVideoDeltas()

**Проблема:** `useTrendTableData.ts` дублирует алгоритм из `computeVideoDeltas.ts` — тот же `findSnapshot` + delta-расчёт, но inline.

**Решение:** Рефакторить `useTrendTableData` на использование `computeVideoDeltas()`. Сложность в том, что `useTrendTableData` работает с `TrendVideo[]` (у которых `viewCount` уже загружен), а `computeVideoDeltas` берёт `currentViews` из latest snapshot. Нужно убедиться, что оба источника "текущих просмотров" согласованы.

**Риск:** Trends Table обрабатывает один канал за раз, а `computeVideoDeltas` может обрабатывать cross-channel video IDs. Рефакторинг может усложнить простой flow.

### 2. Кэширование snapshot-запросов

**Проблема:** Каждый вызов `useVideoDeltaMap` / `computeVideoDeltas` делает независимый Firestore-запрос `getTrendSnapshots()`. Если пользователь открыл Playlist → перешёл в Traffic → вернулся — одни и те же snapshots загружаются заново.

**Решение:** Кэшировать snapshots в `trendStore` или через TanStack Query (по ключу `[userId, channelId, trendChannelId, limitDays]`). Snapshots неизменяемы по своей природе — идеальные кандидаты для агрессивного кэширования.

**Экономия:** При 5 trend channels это минус 5 Firestore-запросов при каждом переключении вкладки.

### 3. channelIdHints — расширить на все потребители

**Проблема:** `TrafficTab` и `usePlaylistDeltaStats` передают `channelIdHints` для сужения запросов. Но `enrichContextWithDeltas` (AI Chat) не передаёт hints — сканирует ВСЕ trend channels.

**Решение:** Извлечь `channelId` из `VideoCardContext` items и передать как hints.

**Экономия:** Если у пользователя 20 trend channels, а в контексте видео только из 3 — это минус 17 лишних запросов.

### 4. Предвычисление дельт на стороне сервера

**Проблема:** Дельты считаются на клиенте при каждом рендере потребителя. Для channels с 500+ видео это ощутимая нагрузка (загрузка snapshots, итерация по всем videos).

**Решение (future):** При создании snapshot вычислять дельты server-side и хранить в `TrendChannel` документе. Клиенту не нужно загружать историю — дельты уже готовы.

**Компромисс:** Увеличивает сложность sync pipeline и размер документа. Имеет смысл только при масштабировании до десятков пользователей.

---

## Technical Implementation

### Типы

```typescript
// src/core/types/videoDeltaStats.ts
interface VideoDeltaStats {
    delta24h: number | null;
    delta7d: number | null;
    delta30d: number | null;
    currentViews: number | null;  // из snapshot, не из video.viewCount
}
```

### Ключевые файлы

| Файл | Роль |
|------|------|
| `src/core/utils/computeVideoDeltas.ts` | Pure async функция: video IDs + trend channels → `Map<videoId, VideoDeltaStats>` |
| `src/core/hooks/useVideoDeltaMap.ts` | React hook-обёртка вокруг `computeVideoDeltas` |
| `src/core/types/videoDeltaStats.ts` | Тип `VideoDeltaStats` |
| `src/features/Playlists/hooks/usePlaylistDeltaStats.ts` | Обёртка: per-video + aggregate totals для плейлиста |
| `src/core/ai/pipeline/enrichContextWithDeltas.ts` | AI Chat: enrichment middleware |
| `src/core/ai/pipeline/prepareContext.ts` | Orchestrator enrichment pipeline |
| `src/core/ai/layers/persistentContextLayer.ts` | Форматирование дельт в Markdown для system prompt |
| `src/pages/Trends/hooks/useTrendTableData.ts` | Inline delta-расчёт для Trends Table (дублирование) |
| `src/pages/Details/tabs/Traffic/TrafficTab.tsx` | Потребитель: `useVideoDeltaMap` → `deltaMap` prop |
| `src/pages/Details/tabs/Traffic/components/TrafficRow.tsx` | Потребитель: `deltaStats` → `VideoPreviewTooltip` |
| `src/features/Video/components/VideoPreviewTooltip.tsx` | UI: три delta-бейджа (24h/7d/30d) |
| `src/features/Video/VideoCard.tsx` | UI: `currentViews` + inline `delta24h` |
| `src/pages/Playlists/PlaylistDetailPage.tsx` | Потребитель: `usePlaylistDeltaStats` → header + sort + grid |
| `src/core/services/trendService.ts` | Firestore-запрос `getTrendSnapshots()` |

### Snapshot Query

```typescript
TrendService.getTrendSnapshots(userId, channelId, trendChannelId, limitDays)
// → query(ref, orderBy('timestamp', 'desc'), limit(limitDays))
// Возвращает TrendSnapshot[] отсортированные DESC (newest first)
```

- `limitDays = 60` — в Trends Table (30d delta + double buffer)
- `limitDays = 32` — в `computeVideoDeltas` (30d + 2-day buffer)
