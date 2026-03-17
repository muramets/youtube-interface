# Video View Deltas (24h / 7d / 30d)

> Кросс-фичовая система, показывающая рост просмотров видео конкурентов за последние сутки, неделю и месяц.

## Что это такое

**Аналогия:** У каждого видео конкурента есть "пульс" — как быстро оно набирает просмотры прямо сейчас. Число `+5.2K (24h)` означает, что за последние сутки это видео получило 5 200 новых просмотров. Три временных окна дают картину: спринт (24h), марафон (7d) и тренд (30d).

**Зачем:** Просмотры сами по себе ничего не говорят — видео с 1M views может быть мёртвым (вышло 3 года назад, 0 роста) или активным (+50K/сутки). Дельта показывает **динамику**, а не статику. Это позволяет быстро находить:
- Видео, которые "взлетают" прямо сейчас (высокий delta24h)
- Evergreen-контент (стабильный delta30d, низкий delta24h)
- Видео, которые затухают (delta24h ≈ 0, delta30d высокий)

## Текущее состояние

← YOU ARE HERE (после рефакторинга — Phases 1-4 + FINAL завершены)

- [x] Расчёт дельт из Trend Snapshots
- [x] Отображение в Trends Table (24h/7d/30d колонки, totals row, smart sort)
- [x] Отображение в Suggested Traffic Table (tooltip при hover на Info icon)
- [x] Отображение в Playlist Details (суммарные дельты в header, сортировка по дельтам, per-video delta в VideoCard)
- [x] Enrichment для AI Chat (автоматическое обогащение контекста перед отправкой модели + channelIdHints)
- [x] Единый вычислитель (`shared/viewDeltas.ts` — SSOT алгоритм, все потребители делегируют)
- [x] Кэширование (`useTrendSnapshots()` — TanStack Query in-memory, инвалидация по `lastUpdated`)
- [x] Серверные AI tools имеют доступ к view deltas (`getMultipleVideoDetails` + `analyzeSuggestedTraffic`)
- [x] `analyzeSuggestedTraffic` tool обогащён view deltas на suggested videos
- [ ] IndexedDB persistence (отложено — in-memory cache достаточен для текущего масштаба)

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

Снимки хранятся в порядке `timestamp DESC` (новейший первый). Снимки **неизменяемы** — раз записаны, не меняются. Новые добавляются при каждом sync (обычно раз в сутки).

### Защиты от дупликатов (добавлены 2026-03-06)

**Баг:** Предположительно при re-deploy Cloud Functions, Cloud Scheduler запустил catch-up execution `scheduledTrendSnapshot`. Несколько параллельных экземпляров функции создали ~186 дублирующих snapshots за один день (2026-03-05). В результате `limit(35)` (лимит на количество документов) покрывал только 4 дня вместо 35 — дельты 7d и 30d показывали `null`.

**Fix 1 — Time-based query:** Заменён `limit(N)` на `where('timestamp', '>=', cutoff)` в `TrendService.getTrendSnapshots()` (frontend) и `trendSnapshotService.getTrendSnapshots()` (backend). Теперь запрос покрывает ровно `DELTA_SNAPSHOT_DAYS` **дней** независимо от количества документов.

**Fix 2 — Idempotency guard:** В `SyncService.syncChannel()` перед записью snapshot проверяется: "есть ли уже snapshot за текущий UTC-день?". Если да — пропускается. Гарантирует max 1 snapshot/day/channel.

**Cleanup:** 186 дубликатов удалены из production Firestore одноразовым скриптом.

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

**Как получает данные:** `useTrendTableData.ts` получает snapshots через `useTrendSnapshots()` (TanStack Query cache) и делегирует delta-расчёт в `calculateViewDeltas()` из `shared/viewDeltas.ts`.

**Что показывает:**
- Три колонки: Last 24h, Last 7d, Last 30d
- Totals row: сумма дельт по всем видео
- `DeltaValue` компонент: зелёный с `+` (рост), красный (падение), серый `0`, прочерк `-` (null)
- Числа в compact-нотации: `1500000` → `1.5M`
- Smart Default Sort: сортировка по `delta24h DESC` если есть данные, иначе fallback на `publishedAt DESC`

**Запрос:** все snapshots за последние `DELTA_SNAPSHOT_DAYS` (35) дней через кэш (time-based `where`, не `limit`).

**Intentional split:** "Views" колонка использует `video.viewCount` (API-synced), дельты — из snapshots. Оба записываются при одном sync, drift <1%.

### 2. Suggested Traffic Table

**Где:** `src/pages/Details/tabs/Traffic/`

**Как получает данные:** `TrafficTab.tsx` вызывает `useVideoDeltaMap()` хук, передавая video IDs из текущих traffic sources. Результат (`deltaMap`) пробрасывается через `TrafficTable` → `TrafficRow` → `VideoPreviewTooltip`.

**Оптимизация channelIdHints:** TrafficTab извлекает `channelId` из каждого traffic source и передаёт как `channelIdHints` — это сужает запрос snapshots только до релевантных trend channels, вместо сканирования всех.

**Что показывает:** В `VideoPreviewTooltip` (появляется при hover на иконку Info рядом с названием видео) — три бейджа:
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

### 4. AI Chat (Enrichment Pipeline)

**Где:** `src/core/ai/pipeline/enrichContextWithDeltas.ts`

**Как получает данные:** Вызывает `computeVideoDeltas()` напрямую (pure async function, без React):
1. Извлекает video IDs и `channelId` из `VideoCardContext` items в `appContextStore`
2. Читает `trendStore.channels` и `channelStore.currentChannel` императивно через `getState()`
3. Передаёт `channelIdHints` (извлечённые из items) для сужения запросов
4. Вычисляет дельты (делегирует в `calculateViewDeltas` из shared)
5. Патчит items: добавляет `delta24h`, `delta7d`, `delta30d`
6. Graceful degradation: если нет snapshot-данных — items возвращаются без delta-полей

**⚠️ Non-React context:** Этот middleware запускается из `chatStore.sendMessage`, не внутри React. Использует `computeVideoDeltas()` (прямые Firestore reads через `TrendService`), а НЕ `useTrendSnapshots()` hook. `channelIdHints` здесь уменьшает **количество Firestore reads** (меньше каналов сканируется), а не cache hits.

### 5. Server-Side AI Tools

**Где:** `functions/src/services/tools/handlers/`

**`getMultipleVideoDetails`:** После получения данных видео, вызывает `getViewDeltas()` из `trendSnapshotService.ts`. Добавляет `viewDelta24h/7d/30d` в ответ каждого видео. Использует `channelId` из данных видео как hint. Graceful degradation: если `getViewDeltas` падает — видео возвращаются без дельт.

**`analyzeSuggestedTraffic`:** После построения `topSources`, вызывает `getViewDeltas()` для всех suggested video IDs. Добавляет `viewDelta24h/7d/30d` к каждому suggested video. `channelId` берётся из `cached_external_videos` — если видео не кэшировано, дельта = null (принятый trade-off). `analysisGuidance` объясняет LLM семантику: "видео, дающее impressions вашему, и одновременно растущее — сигнал сильной алгоритмической ассоциации".

### Enrichment Pipeline (общий поток)

**Когда срабатывает:** Enrichment (consumer #4) запускается автоматически при каждой отправке сообщения в чат, как шаг `prepareContext()`:

```
appContextStore (raw items)
    |
prepareContext()
    |
enrichContextWithDeltas()     <-- здесь
    |
mergeContextItems()
    |
persist to Firestore
    |
buildPersistentContextLayer() --> System Prompt --> AI Model
```

**Формат для модели** (в `persistentContextLayer.ts`):

```
- Competitor: "Video Title" [id: abc123] -- Views: 150K | 24h: +1.2K / 7d: +5.3K / 30d: +12K | Published: 2024-01-15
```

**Зачем:** AI видит не только абсолютные просмотры, а динамику роста — может определить, растёт видео, стагнирует или затухает. Без дельт модели пришлось бы гадать о траектории.

## Data Flow (полная схема)

```
Trend Snapshots (Firestore)
  trendChannels/{id}/snapshots/{ts}
               |
     ----------+-----------
     |                     |
     v                     v
  Frontend              Backend (Cloud Functions)
  TanStack Query        trendSnapshotService.ts
  (useTrendSnapshots)   (admin SDK reads)
     |                     |
     v                     v
  calculateViewDeltas()  <--- shared/viewDeltas.ts (один алгоритм, 0 I/O)
     |                     |
     |                     +---> getMultipleVideoDetails handler
     |                     |       (viewDelta24h/7d/30d в ответе tool)
     |                     +---> analyzeSuggestedTraffic handler
     |                             (view deltas на suggested videos)
     |
  ---+-----------------------------
  |              |                 |
  v              v                 v
useTrendTableData()  useVideoDeltaMap()  enrichContextWithDeltas()
(Trends Table)       (React hook)        (AI middleware, Firestore напрямую)
  |                  |                         |
  v                  +---> TrafficTab          v
Trends Table         |      +-> VideoPreviewTooltip  prepareContext()
(24h/7d/30d +        |                               +-> System Prompt
 totals + sort)      +---> usePlaylistDeltaStats()
                            +-> PlaylistSubtitle (aggregate header)
                            +-> VideoCard (currentViews + delta24h)
```

---

## Архитектурные решения

| # | Решение | Обоснование |
|---|---------|-------------|
| 1 | Snapshots остаются source of truth, без денормализации | Сохраняет возможность рисовать графики просмотров per day; нет лимитов на размер канала |
| 2 | Гибрид: enrichment middleware + серверные tools оба имеют доступ к дельтам | Прикреплённые видео обогащаются автоматически; tools обогащают по запросу LLM |
| 3 | Серверные tools читают snapshots напрямую через admin SDK | Единственный вариант без денормализации; ~0.1-0.2s latency приемлемо |
| 4 | TanStack Query in-memory cache, инвалидация по `lastUpdated` | Snapshots неизменяемы; `gcTime: 30min`; IndexedDB отложен до реальной потребности |
| 5 | `analyzeSuggestedTraffic` обогащается view deltas | +~750-1150 токенов, но LLM видит: видео даёт impressions моему видео И одновременно растёт на YouTube |
| 6 | Tests first → refactor second | 865 тестов (35 файлов) обеспечивают regression safety |
| 7 | Shared algorithm in `shared/viewDeltas.ts` | Один алгоритм, 0 I/O, 0 зависимостей — используется frontend + backend |

## Рефакторинг: выполненные фазы

Все фазы завершены. Детальный чеклист — в `docs/archive/tasks/video-view-deltas-tasks.md`.

| Phase | Что сделано |
|-------|-------------|
| 1 | Safety net тесты (40 тестов на существующую логику до рефакторинга) |
| 2 | Извлечение `calculateViewDeltas()` в `shared/`, удаление дублирования, миграция `VideoDeltaStats` |
| 3 | `useTrendSnapshots()` TanStack Query hook + рефакторинг потребителей + `channelIdHints` |
| 4 | `trendSnapshotService.ts` + `getMultipleVideoDetails` deltas + `analyzeSuggestedTraffic` deltas |
| FINAL | Двойной review (R1: Architecture, R2: Production Readiness) — все проверки пройдены |

### Следующие шаги (не начаты)

- IndexedDB persistence для TanStack Query cache (когда появятся пользователи и измеренная потребность)

---

## Technical Implementation

### Типы

```typescript
// shared/viewDeltas.ts (после рефакторинга — shared между frontend и backend)
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
| `shared/viewDeltas.ts` | **SSOT**: `calculateViewDeltas()` + `VideoDeltaStats` + `DELTA_SNAPSHOT_DAYS` (35). Zero imports. |
| `src/core/hooks/useTrendSnapshots.ts` | TanStack Query cache: per-channel queries, keyed by `lastUpdated`, `gcTime: 30min` |
| `src/core/utils/computeVideoDeltas.ts` | I/O wrapper (non-React): Firestore reads → `calculateViewDeltas()`. Для AI middleware. |
| `src/core/hooks/useVideoDeltaMap.ts` | React hook: `useTrendSnapshots()` → `calculateViewDeltas()` → `Map<videoId, VideoDeltaStats>` |
| `src/features/Playlists/hooks/usePlaylistDeltaStats.ts` | Aggregation: per-video + totals для плейлиста |
| `src/core/ai/pipeline/enrichContextWithDeltas.ts` | AI Chat: enrichment middleware + `channelIdHints` |
| `src/pages/Trends/hooks/useTrendTableData.ts` | Trends Table: cached snapshots → `calculateViewDeltas()` |
| `src/pages/Trends/hooks/useTrendChannelTableData.ts` | Trends Channel Table: cached snapshots → per-channel aggregation |
| `functions/src/services/trendSnapshotService.ts` | Server-side: admin SDK reads → `calculateViewDeltas()` from shared |
| `functions/src/services/tools/handlers/detail/getMultipleVideoDetails.ts` | Tool: enriches videos with `viewDelta24h/7d/30d` |
| `functions/src/services/tools/handlers/analysis/analyzeSuggestedTraffic.ts` | Tool: enriches suggested videos with view deltas |

### Snapshot Query

Все запросы используют `DELTA_SNAPSHOT_DAYS = 35` из `shared/viewDeltas.ts`:

```typescript
// Frontend (через кэш):
useTrendSnapshots() → TrendService.getTrendSnapshots(userId, channelId, tcId, DELTA_SNAPSHOT_DAYS)

// Frontend (non-React, AI middleware):
computeVideoDeltas() → TrendService.getTrendSnapshots(userId, channelId, tcId, DELTA_SNAPSHOT_DAYS)

// Backend (admin SDK):
trendSnapshotService.getTrendSnapshots(userId, channelId, tcId, DELTA_SNAPSHOT_DAYS)
```
