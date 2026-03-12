# Video Tooltip & Video Map — Рефакторинг

> **Статус:** Завершено
> **Scope:** Frontend only (бэкенд не затрагивается)
> **Task doc:** `docs/archive/tasks/chat/video-tooltip-refactor-tasks.md`

## Что это — простыми словами

Когда AI-ассистент вызывает инструменты (browse videos, find similar, mention video и т.д.), каждый инструмент возвращает данные о видео. Эти данные собираются в единую "карту видео" (video map), а при наведении мышки на видео в чате показывается tooltip с метаданными.

## Текущее состояние

Единый `VideoPreviewTooltip` с двумя режимами (`full` 800×700 для Trends/Traffic, `mini` 480×auto для Chat). Dedicated `VideoPreviewData` type заменил `VideoCardContext` в tooltip path — без fake values и `number→string→number` roundtrip. `ToolCallSummary` разбит из God Component (602→215 строк) на orchestrator + 11 модулей в `toolStats/`. Tool registry (13 tools) обеспечивает Open-Closed: новый tool = запись в registry + extractor в buildToolVideoMap + extractor в toolCallGrouping. 32 теста покрывают все 7 extractors и grouping.

### Что было сделано

- **Unified tooltip:** два компонента (`VideoTooltipContent` + `VideoPreviewTooltip`) объединены в один с `full`/`mini` режимами. `VideoTooltipContent` удалён.
- **`VideoPreviewData` type:** dedicated tooltip type в `src/features/Video/types.ts`. `viewCount: number` (не string). Все поля кроме `videoId`/`title` — optional.
- **ToolCallSummary decomposition:** 11 Stats-компонентов → `toolStats/`. `toolRegistry.ts` — unified config per tool.
- **`buildToolVideoMap`:** 7 extractors (mentionVideo, browseChannelVideos, getMultipleVideoDetails, findSimilarVideos, browseTrendVideos, getNicheSnapshot, searchDatabase). Возвращает `Map<string, VideoPreviewData>`.
- **`CopyButton` atom:** relocated из ChatMessageList в `src/components/ui/atoms/`, расширен API (size, title, className).
- **`PortalTooltip` fixedDimensions:** parametric размеры вместо хардкода 800×700. `height` optional — auto-height с `max-height` для content-driven sizing. Deprecated `fixedWidth`/`estimatedHeight` удалены. Overlay scrollbar (`scrollbar-auto-hide`) вместо `scrollbarGutter: 'stable'`.
- **`formatDelta()` + `getDeltaColor()`:** shared utils в `formatUtils.ts`. Significance-based coloring: gray default, amber >5% ratio, emerald >10% ratio (delta/viewCount).
- **Mini-player button:** доступен в обоих режимах (full + mini).
- **`youtubeVideoId` support:** `VideoPreviewData` содержит `youtubeVideoId` — YouTube-embeddable ID, отличающийся от `videoId` для custom-видео (`custom-*` doc IDs). Backend handlers (`mentionVideo`, `getMultipleVideoDetails`) пробрасывают `publishedVideoId` для custom published видео. `buildToolVideoMap` передаёт поле в `extractMention` и `extractDetails`. `VideoPreviewTooltip` использует `embedId` resolution: regular → `videoId`, custom published → `youtubeVideoId`, draft → `undefined` (static thumbnail).
- **Custom video embed fix:** iframe player теперь корректно обрабатывает три случая: (1) regular video — embed по `videoId`, (2) custom published — embed по `youtubeVideoId` (`publishedVideoId`), (3) draft — static thumbnail из Firebase Storage, minimize button скрыт.

### Known Issue: Thumbnail Resolution Architecture

Разрешение thumbnail для custom-видео (особенно драфтов) — NOT clean architecture. Fallback-логика разбросана по трём местам:

1. **Backend** (`mentionVideo.ts`, `getMultipleVideoDetails.ts`): читает `data.thumbnail` из Firestore. Для custom-видео это Firebase Storage URL. Для non-custom — YouTube CDN fallback (`https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`).
2. **`buildToolVideoMap.ts`**: для tools, не возвращающих `thumbnailUrl` (findSimilar, trendVideos, nicheSnapshot, searchDatabase), подставляет YouTube CDN URL через `ytThumbnailUrl()`. Для `custom-*` ID возвращает `undefined` (нет YouTube thumbnail).
3. **`VideoPreviewTooltip.tsx`**: использует `video.thumbnailUrl` напрямую для static thumbnail (draft). YouTube CDN fallback используется для hqdefault в mini-player state.

**Контракт неявный:** если backend не вернул `thumbnailUrl` для custom draft, а `buildToolVideoMap` не имеет fallback для `custom-*` — tooltip покажет пустое место. Работает только потому, что `mentionVideo` и `getMultipleVideoDetails` всегда возвращают `data.thumbnail` для custom-видео.

**Решение (отложено):** Consolidation в один fallback chain с explicit contract. Не фиксим сейчас — работает корректно для всех текущих paths.

---

## Найденные проблемы

### P1. Дублирование tooltip-компонентов

**Суть:** `VideoTooltipContent` (Chat) и `VideoPreviewTooltip` (Trends/Traffic) рисуют одно и то же — метаданные видео — но с разной полнотой и стилем.

**Последствие:** пользователь видит два разных UX для одной сущности в зависимости от того, где навёл мышку. Chat tooltip выглядит "дешёвым" по сравнению с Trends.

**Решение:** Единый `VideoPreviewTooltip` с двумя режимами размера (`mini` для чата, `full` для Trends/Traffic).

### P2. `VideoPreviewTooltip` принимает flat props вместо объекта

**Суть:** Trends/Traffic передают данные как россыпь props (`videoId`, `title`, `channelTitle`, `viewCount`, ...), а Chat система работает с `VideoCardContext` объектом. Это несовместимые API.

**Последствие:** невозможно просто переиспользовать `VideoPreviewTooltip` в Chat без адаптера.

**Решение:** Создать dedicated `VideoPreviewData` type (см. секцию "Ключевое архитектурное решение" ниже). `VideoPreviewTooltip` принимает `VideoPreviewData` — чистый tooltip-ориентированный тип без baggage от app context union.

### P2a. `VideoCardContext` — неправильный universal type для tooltip

**Суть:** `VideoCardContext` — это member дискриминированного union (`type: 'video-card'`), предназначенный для app context awareness (canvas, chat context). Он несёт поля, нерелевантные для tooltip:
- `type: 'video-card'` — дискриминантное поле union
- `ownership: required` — Trends-видео не имеют "ownership" в смысле app context
- `publishedVideoId`, `color`, `addedAt` — canvas-specific
- `viewCount: string` — tooltip нужен `number` для форматирования

**Последствие:** `buildToolVideoMap` вынужден подставлять fake values (`type: 'video-card'`, `ownership: 'competitor'`) для каждого видео. `stringifyCount()` конвертирует `number → string`, а `formatViewCount()` в tooltip парсит обратно — бессмысленный roundtrip.

**Решение:** `VideoPreviewData` — dedicated type. `buildToolVideoMap` возвращает `Map<string, VideoPreviewData>`. Adapter нужен только в одном месте — `ChatMessageList`, где `persistedContext` (VideoCardContext[]) конвертируется в `VideoPreviewData`.

### P3. `ToolCallSummary` — God Component (602 строки)

**Суть:** Один файл содержит:
- 8 специализированных Stats-компонентов (AnalysisStats, TrafficSourceStats, ChannelOverviewStats, BrowseChannelStats, TrendChannelsStats, BrowseTrendStats, NicheSnapshotStats, FindSimilarStats)
- ThumbnailGrid
- QuotaBadge
- GroupPill (основная pill-кнопка)
- getFallbackTitle helper
- Основной ToolCallSummary

**Последствие:** Сложно поддерживать, сложно найти нужный компонент, нарушение SRP.

**Решение:** Извлечь Stats-компоненты в `src/features/Chat/components/toolStats/`, каждый в свой файл. `ToolCallSummary` станет чистым orchestrator (~200 строк).

### P4. Разрозненные if-chains для icon, color, StatsComponent, expandability

**Суть:** Для каждого tool четыре отдельных chain-of-ifs в разных местах:
- **Icon:** строки 405–428 в `ToolCallSummary.tsx` — 9-уровневый тернарный оператор
- **Color:** строки 379–387 — inline выбор `indigo/amber/emerald`
- **StatsComponent:** строки 443–469 — chain `group.toolName === ...`
- **Expandability:** `isExpandable()` в `toolCallGrouping.ts` — chain of ifs

**Последствие:** Добавление нового tool требует правок в 4 местах. Легко пропустить одно из них.

**Решение:** Unified `toolRegistry.ts` — one tool = one config entry (Open-Closed Principle). Registry покрывает простые lookups (icon, color, StatsComponent, expandable flag). `getGroupLabel()` остаётся отдельной функцией — её label-логика слишком специфична для каждого tool (5–15 строк с парсингом result), что не поместится в config object без потери читаемости.

```typescript
// src/features/Chat/utils/toolRegistry.ts
interface ToolConfig {
    icon: LucideIcon | '@';
    color: 'indigo' | 'amber' | 'emerald';
    StatsComponent?: React.FC<{ result: Record<string, unknown> }>;
    /** Whether this tool CAN show expanded content (static capability flag). */
    hasExpandableContent: boolean;
}

const TOOL_REGISTRY: Record<string, ToolConfig> = {
    mentionVideo:            { icon: '@',           color: 'indigo',  hasExpandableContent: true },
    viewThumbnails:          { icon: Images,        color: 'amber',   StatsComponent: ThumbnailGrid, hasExpandableContent: true },
    getChannelOverview:      { icon: Globe,         color: 'emerald', StatsComponent: ChannelOverviewStats, hasExpandableContent: true },
    browseChannelVideos:     { icon: Globe,         color: 'emerald', StatsComponent: BrowseChannelStats, hasExpandableContent: true },
    analyzeTrafficSources:   { icon: PieChart,      color: 'emerald', StatsComponent: TrafficSourceStats, hasExpandableContent: true },
    analyzeSuggestedTraffic: { icon: BarChart3,     color: 'emerald', StatsComponent: AnalysisStats, hasExpandableContent: true },
    listTrendChannels:       { icon: Users,         color: 'emerald', StatsComponent: TrendChannelsStats, hasExpandableContent: true },
    browseTrendVideos:       { icon: TrendingUp,    color: 'emerald', StatsComponent: BrowseTrendStats, hasExpandableContent: true },
    getNicheSnapshot:        { icon: Telescope,     color: 'emerald', StatsComponent: NicheSnapshotStats, hasExpandableContent: true },
    findSimilarVideos:       { icon: Search,        color: 'emerald', StatsComponent: FindSimilarStats, hasExpandableContent: true },
    searchDatabase:          { icon: Search,        color: 'emerald', StatsComponent: SearchDatabaseStats, hasExpandableContent: true },
    getVideoComments:        { icon: MessageSquare, color: 'emerald', hasExpandableContent: false },
    getMultipleVideoDetails: { icon: Check,         color: 'emerald', hasExpandableContent: true },
};
```

Runtime `isExpandable()` схлопывается в одну универсальную формулу — static config (can) + runtime state (ready):

```typescript
// toolCallGrouping.ts — replaces 15-line chain of ifs
function isExpandable(group: ToolCallGroup): boolean {
    const config = TOOL_REGISTRY[group.toolName];
    if (!config?.hasExpandableContent) return false;
    return group.allResolved && (group.videoIds.length > 0 || !!config.StatsComponent);
}
```

### P5. `getFallbackTitle` дублирует `buildToolVideoMap`

**Суть:** `getFallbackTitle()` в `ToolCallSummary` (строки 534–562) — это мини-версия `buildToolVideoMap`, которая заново парсит tool results, чтобы найти title, когда видео нет в videoMap.

**Причина существования:** рассинхрон между `toolCallGrouping.ts` (извлекает videoIds) и `buildToolVideoMap.ts` (строит карту). Если tool добавлен в grouping, но не в videoMap — видео появляется в списке, но без данных.

**Решение:** Синхронизировать extractors. Убедиться, что каждый tool из `toolCallGrouping.ts` также представлен в `buildToolVideoMap.ts`. После этого `getFallbackTitle` можно удалить.

### P6. Дублирование thumbnail URL fallback

**Суть:** YouTube thumbnail fallback (`https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`) присутствует в двух местах:
- `buildToolVideoMap.ts:249` → `ytThumbnailUrl()`
- `ToolCallSummary.tsx:477` → inline fallback

**Решение:** Удалить inline fallback из `ToolCallSummary`. `buildToolVideoMap` уже покрывает этот случай.

### P7. `searchDatabase` не подключен к video map

**Суть:** Tool `searchDatabase` возвращает видео (`results[].videoId, title, channelTitle, viewCount, publishedAt, viewDelta24h/7d/30d, performanceTier, relevanceScore`), но отсутствует:
- В `buildToolVideoMap.ts` — нет extractor
- В `toolCallGrouping.ts` — нет video ID extraction, нет label, нет expandability

**Последствие:** Видео из searchDatabase не появляются в tooltip-системе. Нет превью, нет enrichment.

**Решение:** Добавить extractors в оба файла. Структура result: `{ results: [{ videoId, title, channelTitle, ... }] }`.

### P8. Два дублирующихся `formatDelta()` + несогласованные delta-форматы

**Суть:** Два independent `formatDelta()` хелпера с разной логикой:
- `VideoTooltipContent.tsx:39-42` — использует `formatViewCount()` из core utils
- `VideoPreviewTooltip.tsx:204-208` — inline с `K` suffix и `−` minus sign

Плюс `colorFor()` в VideoPreviewTooltip — inline helper для emerald/orange цвета delta.

**Последствие:** дублирование алгоритма + визуальная несогласованность (Chat: белый inline текст, Trends: цветные badges).

**Решение:** Экстрагировать `formatDelta()` и `getDeltaColor()` в `src/core/utils/formatUtils.ts` (там уже живёт `formatViewCount()`). В unified tooltip — единый вызов shared utility. Цветные badges (emerald/orange) как единый стиль.

### P9. `viewCount` type mismatch и бессмысленный roundtrip

**Суть:** `VideoCardContext.viewCount` — `string`. `VideoPreviewTooltip` ожидает `number` (вызывает `.toLocaleString()`). `buildToolVideoMap` конвертирует `number → string` через `stringifyCount()`, а потом tooltip парсит обратно.

**Решение:** `VideoPreviewData.viewCount: number | undefined`. Backend возвращает `number` — сохраняем as-is. Tooltip форматирует через `formatViewCount()`. `stringifyCount()` удаляется.

### P11. Dead code: ResizeObserver с пустым callback

**Суть:** `VideoPreviewTooltip.tsx:56-65` — `ResizeObserver` с пустым callback (`() => { // Resize handling if needed }`). Не делает ничего.

**Решение:** Удалить при рефакторинге в P1.

### M1. `canLoad` delay 300ms — undocumented UX workaround

**Суть:** `VideoPreviewTooltip.tsx:47-52` — 300ms delay перед загрузкой iframe. Без комментария почему. Это tooltip flicker prevention: iframe mount вызывает layout shift, который может "убить" tooltip при первом рендере.

**Решение:** Не менять логику — добавить комментарий при рефакторинге в P1, объясняющий назначение delay.

### M3. `browseChannelVideos` / `browseTrendVideos` stats показывают только последний record

**Суть:** `ToolCallSummary.tsx` для этих tools берёт `group.records[records.length - 1]?.result` — stats отражают только последний вызов. Если AI вызвал tool дважды (разные каналы или фильтры), stats первого вызова теряются.

**Решение:** Stats компоненты (`BrowseChannelStats`, `BrowseTrendStats`) должны агрегировать данные из всех `group.records`, а не только из последнего. `group.records` уже содержит все вызовы — нужно просто итерировать и суммировать (videos count, quota, etc.).

### M2. `formatDate` дублирование с разными locales

**Суть:** Два independent date formatters:
- `VideoPreviewTooltip.tsx:69-78` — `en-GB` locale, формат `dd/mm/yyyy hh:mm`
- `VideoTooltipContent.tsx:30-37` — `undefined` locale (browser default), формат `Jan 15, 2024`

**Решение:** При объединении tooltip — один формат. Использовать `formatPublishedDate()` из core utils (или экстрагировать туда). Формат `Jan 15, 2024` (short month) — более читаемый для international audience.

### P12. Дублирование copy button паттерна в VideoPreviewTooltip

**Суть:** Три identical copy button блока (title, description, tags) с одинаковым паттерном: `useState(isCopied)` + `setTimeout` + icon toggle (`Copy` → `Check`). При объединении tooltip дублирование сохранится.

**Решение:** Переместить существующий `CopyButton` из `ChatMessageList.tsx:170-203` в `src/components/ui/atoms/CopyButton.tsx` и расширить API. Существующая реализация уже содержит fallback для non-secure contexts (`document.execCommand`). Не создавать заново — relocate + extend.

```typescript
// src/components/ui/atoms/CopyButton.tsx
interface CopyButtonProps {
    text: string;
    /** Size of the icon (default: 11) */
    size?: number;
    /** Label for tooltip (default: "Copy") */
    title?: string;
    className?: string;
}
```

Потребители после relocation: `ChatMessageList` (copy message), `VideoPreviewTooltip` (copy title/description/tags).

### P10. Недостаточное тестовое покрытие buildToolVideoMap

**Суть:** Тесты покрывают только 3 из 6 tools: `mentionVideo`, `browseChannelVideos`, `getMultipleVideoDetails`. Нет тестов для:
- `findSimilarVideos` (с channelName mapping через dataFreshness)
- `browseTrendVideos` (с deltas)
- `getNicheSnapshot` (nested competitorActivity)
- `searchDatabase` (после добавления)
- Merge strategy для deltas

**Решение:** Добавить тесты для каждого tool + edge cases (delta merge, channelName fallback).

---

## Data Enrichment Strategy: merge-without-overwrite

### Текущая семантика: first-write-wins

`buildToolVideoMap` обрабатывает tool results в хронологическом порядке (как они появляются в сообщениях). `mergeInto()` заполняет пустые поля, но **не перезаписывает** уже заполненные.

### Почему это работает

**1. Telescope Pattern обеспечивает правильный порядок.** AI вызывает tools от общего к частному:

```
mentionVideo (title only)
  → browseChannelVideos (+ viewCount, publishedAt)
    → getMultipleVideoDetails (+ description, tags, duration)
```

Каждый следующий инструмент добавляет **новые поля**, которые предыдущие не предоставляли. Gaps заполняются naturally — priority system не нужна.

**2. Ни один backend handler не обрезает title.** Все источники хранят и возвращают полные значения. Truncation (`line-clamp-2`) происходит только в UI rendering.

**3. Единственная реальная quality difference — `viewCount` freshness:**

| Source | viewCount freshness |
|---|---|
| `browseChannelVideos` | Firestore cache (может быть stale на часы/дни) |
| `getMultipleVideoDetails` | YouTube API (свежий) |
| `browseTrendVideos` | Trend sync cache |

Если browse пришёл первым (stale 100K), а details вторым (fresh 120K) — tooltip покажет 100K. Для информационного tooltip это acceptable trade-off vs complexity priority-системы.

### Отклонённая альтернатива: source priority registry

```typescript
// НЕ ДЕЛАЕМ:
const SOURCE_PRIORITY: Record<string, number> = {
    getMultipleVideoDetails: 10,
    browseTrendVideos: 7,
    // ...
};
```

**Причина отклонения:** over-engineering. Нужно трекать source для каждого поля, priority registry, усложнение merge, больше тестов. Реальных багов от first-write-wins нет. `getFallbackTitle` (P5) существует из-за рассинхрона grouping↔videoMap, не из-за merge quality.

### Осознанный gap: `getVideoComments` не в `buildToolVideoMap`

`getVideoComments` присутствует в `toolCallGrouping.ts:61` (извлекает videoId из args), но **намеренно отсутствует** в `buildToolVideoMap`. Comments — не video metadata. Tool возвращает комментарии, не обогащает video map.

### Осознанный gap: `browseChannelVideos` не в `extractVideoIdsForTool()`

`browseChannelVideos` присутствует в `buildToolVideoMap` (обогащает video map), но **намеренно отсутствует** в `toolCallGrouping.ts → extractVideoIdsForTool()`. Это значит `group.videoIds` пуст → при expand нет video rows.

**Это by design:** browse может вернуть десятки видео. Показывать их все как video preview rows — noise. `BrowseChannelStats` (summary: "15 videos returned, 10 cached, 5 fetched") — правильный формат для этого tool. Video rows уместны для tools с targeted результатами (mentionVideo, findSimilarVideos, browseTrendVideos).

### Возможное будущее улучшение

Если появится реальный баг от stale data — хирургическое решение: `getMultipleVideoDetails` как canonical source перезаписывает `viewCount` безусловно. Одна строка, не architecture change.

---

## Ключевое архитектурное решение: `VideoPreviewData`

### Почему не `VideoCardContext`

`VideoCardContext` — member дискриминированного union `AppContextItem` (через `type: 'video-card'`). Это **app context type**, не tooltip type. Привязывать tooltip к нему — это coupling:

```typescript
// Текущий buildToolVideoMap — каждый extractor подставляет fake values:
map.set(videoId, {
    type: 'video-card',                    // ← fake: tooltip это не волнует
    ownership: incoming.ownership || 'competitor', // ← fake default
    viewCount: stringifyCount(v.viewCount),        // ← number→string→number roundtrip
    // ...
});
```

При добавлении новых источников (Music page, Playlists) friction только вырастет.

### Новый тип: `VideoPreviewData`

```typescript
// src/features/Video/types.ts
interface VideoPreviewData {
    videoId: string;
    /** YouTube-embeddable ID. Differs from videoId for custom videos (custom-* doc IDs).
     *  Undefined for drafts (not published to YouTube). */
    youtubeVideoId?: string;
    title: string;
    thumbnailUrl?: string;
    channelTitle?: string;
    channelId?: string;
    viewCount?: number;              // ← number, не string. Без roundtrip.
    publishedAt?: string;
    duration?: string;
    description?: string;
    tags?: string[];
    ownership?: 'own-draft' | 'own-published' | 'competitor';  // ← optional
    delta24h?: number | null;
    delta7d?: number | null;
    delta30d?: number | null;
}
```

### Что это меняет

| Аспект | Было (VideoCardContext) | Стало (VideoPreviewData) |
|---|---|---|
| `buildToolVideoMap` return type | `Map<string, VideoCardContext>` | `Map<string, VideoPreviewData>` |
| Fake values в extractors | `type: 'video-card'`, `ownership: 'competitor'` | Нет — все поля optional |
| `stringifyCount()` | Конвертит number→string | Удаляется — viewCount остаётся number |
| Trends/Traffic callers | Нужен `toVideoCardContext()` adapter | Данные мэпятся почти 1:1 |
| ChatMessageList merge | Тривиальный (один тип) | `toPreviewData(ctx: VideoCardContext)` — один маппер в одном месте |
| Новые data sources | Нужен fake `type: 'video-card'` | Просто заполни поля |

### Adapter: `toPreviewData`

Единственное место, где `VideoCardContext → VideoPreviewData` — это `ChatMessageList`, где `persistedContext` (приложенные пользователем видео) мержится с tool results:

```typescript
function toPreviewData(ctx: VideoCardContext): VideoPreviewData {
    return {
        videoId: ctx.videoId,
        title: ctx.title,
        thumbnailUrl: ctx.thumbnailUrl || undefined,
        channelTitle: ctx.channelTitle,
        viewCount: ctx.viewCount ? Number(ctx.viewCount) : undefined,
        publishedAt: ctx.publishedAt,
        duration: ctx.duration,
        description: ctx.description,
        tags: ctx.tags,
        ownership: ctx.ownership,
        delta24h: ctx.delta24h,
        delta7d: ctx.delta7d,
        delta30d: ctx.delta30d,
    };
}
```

---

## Архитектурное решение: Unified VideoPreviewTooltip

### Целевая архитектура

```
VideoPreviewTooltip (unified)
├── mode: 'full' | 'mini'
├── data: VideoPreviewData (dedicated tooltip type)
│
├── [full]  YouTube Player (iframe embed, 800×700, PortalTooltip sizeMode="fixed")
├── [mini]  YouTube Player (iframe embed, ~420×500, PortalTooltip sizeMode="fixed" с fixedDimensions)
│
├── Title + Channel + Copy button
├── Metric badges: views, duration, date
├── Delta badges: 24h/7d/30d (цветные, emerald/orange)
├── Ownership / Type label (если есть)
├── Percentile tier badge (если есть)
├── Description (expandable) + Copy button
└── Tags (expandable) + Copy button
```

### Два режима: `full` vs `mini`

| Параметр | `full` | `mini` |
|---|---|---|
| Использование | Trends Table, Traffic Row, Trend Timeline | Chat (ToolCallSummary, VideoReferenceTooltip) |
| Размер tooltip | 800×700px | 480×auto (content-driven height) |
| YouTube player | Полный aspect-video | Компактный aspect-video |
| Copy buttons | Есть | Есть |
| Mini-player кнопка | Есть | Есть |
| Comparison mode | Есть (опционально) | Нет |
| Контент | Полный | Тот же, но player меньше |

**Ключевой принцип: "show what you have"** — каждая секция рендерится только если данные присутствуют. Title-only видео покажет player + title. Видео после `getMultipleVideoDetails` покажет всё.

### Props API (unified)

```typescript
interface VideoPreviewTooltipProps {
    /** Core video data — dedicated tooltip type, source-agnostic */
    video: VideoPreviewData;
    /** Display mode: 'full' (800×700) for Trends/Traffic, 'mini' (~420×500) for Chat */
    mode?: 'full' | 'mini';
    /** Additional enrichments (Trends/Traffic only) */
    percentileGroup?: string;
    comparisonVideo?: VideoDetails;
    /** Override delta source (when VideoPreviewData deltas are null but external deltas exist) */
    deltaStats?: VideoDeltaStats;
}
```

### Callers — до и после

**Trends/Traffic** (данные почти 1:1, minimal mapping):
```tsx
<VideoPreviewTooltip
    video={{ videoId: video.id, title: video.title, viewCount: video.viewCount, ... }}
    percentileGroup={tier}
    deltaStats={deltas}
/>
```

**Chat ToolCallSummary** (данные уже `VideoPreviewData` из `buildToolVideoMap`):
```tsx
<PortalTooltip
    content={<VideoPreviewTooltip video={v} mode="mini" />}
    variant="glass"
    sizeMode="fixed"
    fixedDimensions={{ width: 420, height: 500 }}
/>
```

---

## Целевая файловая структура после рефакторинга

```
src/features/Video/
  types.ts                             ← НОВЫЙ: VideoPreviewData type
  components/
    VideoPreviewTooltip.tsx            ← Unified (рефакторнутый, принимает VideoPreviewData)

src/features/Chat/
  ChatMessageList.tsx                  ← toPreviewData() adapter (VideoCardContext → VideoPreviewData)
  components/
    ToolCallSummary.tsx                ← Чистый orchestrator (~200 строк)
    VideoReferenceTooltip.tsx          ← Использует VideoPreviewTooltip mode="mini"
    toolStats/                         ← НОВАЯ папка
      index.ts                         ← Re-export всех stats
      AnalysisStats.tsx
      TrafficSourceStats.tsx
      ChannelOverviewStats.tsx
      BrowseChannelStats.tsx
      TrendChannelsStats.tsx
      BrowseTrendStats.tsx
      NicheSnapshotStats.tsx
      FindSimilarStats.tsx
      SearchDatabaseStats.tsx          ← НОВЫЙ (для searchDatabase)
      ThumbnailGrid.tsx
      QuotaBadge.tsx
  utils/
    buildToolVideoMap.ts               ← Возвращает Map<string, VideoPreviewData>
    toolCallGrouping.ts                ← + searchDatabase support, isExpandable() → one-liner via registry
    toolRegistry.ts                    ← НОВЫЙ (icon, color, StatsComponent, expandable per tool)

УДАЛИТЬ:
  src/features/Chat/components/VideoTooltipContent.tsx
```

---

## Фазы реализации

### Parallelization strategy

```
P1 + P3 + P4 — PARALLEL (независимые файлы, разные домены)
      ↓
     P2 — SEQUENTIAL (интеграция: зависит от P1 + P3)
```

P1 меняет `VideoPreviewTooltip` + adapter + Trends/Traffic callers.
P3 разбивает `ToolCallSummary` на модули.
P4 добавляет `searchDatabase` в `buildToolVideoMap` + `toolCallGrouping`.
P2 интегрирует unified tooltip в Chat — проще делать когда ToolCallSummary уже разбит (P3) и tooltip готов (P1).

### P1. VideoPreviewData type + Unified VideoPreviewTooltip + PortalTooltip fixedDimensions

**Цель:** Dedicated tooltip type. Один tooltip-компонент — два режима. Parametric fixed dimensions.

**Задачи:**
- [x] Создать `VideoPreviewData` type в `src/features/Video/types.ts` (решение P2a)
- [x] Добавить `fixedDimensions` prop в `PortalTooltip`
- [x] Удалить deprecated `fixedWidth` и `estimatedHeight` props, мигрировать callers
- [x]Рефакторнуть `VideoPreviewTooltip` → принимает `VideoPreviewData` + `mode` prop (решение P1, P2)
- [x]Добавить `mini` mode (~420×500px): уменьшенный player, compact layout
- [x]`full` mode: текущее поведение (backward compat)
- [x]Унифицировать delta rendering — цветные badges в обоих режимах (решение P8)
- [x]Использовать `formatViewCount()` вместо `.toLocaleString()` (решение P9)
- [x]Удалить dead code: ResizeObserver с пустым callback (решение P11)
- [x]Переместить `CopyButton` из `ChatMessageList.tsx` в `src/components/ui/atoms/CopyButton.tsx`, расширить API (решение P12)
- [x]Заменить 3 inline copy button блока на `CopyButton` в unified tooltip
- [x]Обновить `ChatMessageList` → импорт из нового расположения
- [x]Обновить Trends/Traffic callers (`TrendsVideoRow`, `TrendTooltip`, `TrafficRow`) на новый API
- [x]Проверить: lint + typecheck + existing tests

### P2. Подключить к Chat (зависит от P1 + P3)

**Цель:** Chat использует unified tooltip. Удаление дубликатов.

**Задачи:**
- [x]`buildToolVideoMap` → возвращает `Map<string, VideoPreviewData>`, удалить `stringifyCount()` (решение P2a, P9)
- [x]`ChatMessageList` → `toPreviewData()` adapter для merge `persistedContext` (VideoCardContext) с `toolMap` (VideoPreviewData)
- [x]`ToolCallSummary`: заменить VideoTooltipContent → VideoPreviewTooltip mode="mini" через PortalTooltip `sizeMode="fixed"` `variant="glass"` `fixedDimensions={PREVIEW_DIMENSIONS.mini}`
- [x]`VideoReferenceTooltip`: props `video: VideoCardContext | null` → `video: VideoPreviewData | null` + аналогичная замена tooltip
- [x]Удалить `VideoTooltipContent.tsx` (решение P1)
- [x]Удалить `getFallbackTitle()` — после синхронизации extractors в P4 (решение P5)
- [x]Удалить дублирующий thumbnail fallback из ToolCallSummary (решение P6)
- [x]Проверить: lint + typecheck + tests

### P3. Рефакторинг ToolCallSummary

**Цель:** Разбить God Component (602 строк) на чистые модули (~200 строк orchestrator).

**Задачи:**
- [x]Извлечь 8 Stats компонентов в `toolStats/` (решение P3)
- [x]Извлечь ThumbnailGrid, QuotaBadge в `toolStats/`
- [x]Создать `toolRegistry.ts` — unified config per tool: icon, color, StatsComponent, expandable (решение P4)
- [x]GroupPill: заменить icon chain, color chain, stats chain → registry lookups
- [x]`isExpandable()` в `toolCallGrouping.ts` → одна формула: `config.hasExpandableContent && group.allResolved && (videoIds || StatsComponent)`
- [x]ToolCallSummary → чистый orchestrator
- [x]Убедиться, что все user-facing тексты — на английском (CLAUDE.md design rule)
- [x]Проверить: lint + typecheck + tests

### P4. searchDatabase + тесты

**Цель:** Полное покрытие video map системы.

**Задачи:**
- [x]Добавить `searchDatabase` в `buildToolVideoMap.ts` — extractor для `result.results[]` (решение P7)
- [x]Добавить `searchDatabase` в `toolCallGrouping.ts` — videoIds extraction, label, expandability
- [x]Добавить `SearchDatabaseStats` компонент в `toolStats/`
- [x]Тесты buildToolVideoMap: findSimilarVideos, browseTrendVideos, getNicheSnapshot, searchDatabase (решение P10)
- [x]Тесты: delta merge, channelName fallback через dataFreshness
- [x]Проверить: lint + typecheck + all tests pass

---

## PortalTooltip: parametric fixed dimensions

### Проблема

Сейчас `sizeMode="fixed"` хардкодит размеры 800×700px (константы `FIXED_TOOLTIP_WIDTH`, `FIXED_TOOLTIP_HEIGHT`). Существующий `fixedWidth` prop переопределяет только ширину. Для высоты аналога нет — она всегда рассчитывается от viewport space. Для `mini` mode нужны другие размеры (~420×500px), а текущий API этого не позволяет.

### Отклонённая альтернатива: auto mode + CSS

Предлагалось убрать `sizeMode="fixed"` для mini tooltip и позволить content component определять свой размер через CSS classes. Это убрало бы magic numbers из callers.

**Причина отклонения:** PortalTooltip использует размеры **до рендера** для позиционирования (центрирование, viewport clamping, flip). В auto mode размеры неизвестны до mount → для 420×500px tooltip с YouTube iframe будет заметный position jump при перерасчёте. `sizeMode="fixed"` существует именно для этого — accurate positioning for large tooltips.

### Решение: `fixedDimensions` prop + dimensions co-located with content

Добавить новый prop в PortalTooltip:
```typescript
fixedDimensions?: { width: number; height?: number };
```

При `sizeMode="fixed"`:
- Если `fixedDimensions` задан → использовать его значения
- Если нет → fallback на текущие константы (800×700)

Заодно удалить deprecated props `fixedWidth` и `estimatedHeight`, мигрировав все callers.

**Dimensions живут в content component (SSOT), не в callers:**

```typescript
// VideoPreviewTooltip.tsx — content component owns its dimensions
export const PREVIEW_DIMENSIONS = {
    full: { width: 800, height: 700 },
    mini: { width: 480 },
} as const;
```

### Как Chat tooltip будет использовать PortalTooltip

Сейчас:
```tsx
<PortalTooltip content={<VideoTooltipContent video={v} />} maxWidth={320} />
```

После (no magic numbers — dimensions imported from content component):
```tsx
import { PREVIEW_DIMENSIONS } from '../../Video/components/VideoPreviewTooltip';

<PortalTooltip
    content={<VideoPreviewTooltip video={v} mode="mini" />}
    variant="glass"
    sizeMode="fixed"
    fixedDimensions={PREVIEW_DIMENSIONS.mini}  // { width: 480 } — auto height
/>
```

---

## Technical Implementation

### Ключевые файлы

| Файл | Строк | Роль |
|---|---|---|
| `src/features/Video/types.ts` | 39 | `VideoPreviewData` type (incl. `youtubeVideoId`) + `PREVIEW_DIMENSIONS` constants |
| `src/features/Video/components/VideoPreviewTooltip.tsx` | 291 | Unified tooltip: `full`/`mini` modes, `video: VideoPreviewData` |
| `src/features/Chat/utils/buildToolVideoMap.ts` | 288 | 7 extractors → `Map<string, VideoPreviewData>`, first-write-wins merge |
| `src/features/Chat/utils/toolCallGrouping.ts` | 341 | Группировка, videoIds, labels, `isExpandable()` via registry |
| `src/features/Chat/utils/toolRegistry.ts` | 122 | 13 tools: icon, color, StatsComponent, hasExpandableContent |
| `src/features/Chat/components/ToolCallSummary.tsx` | 215 | Orchestrator (was 602) |
| `src/features/Chat/components/toolStats/` | 11 files | Stats components per tool + ThumbnailGrid + QuotaBadge |
| `src/features/Chat/utils/toPreviewData.ts` | 28 | Adapter `VideoCardContext → VideoPreviewData` |
| `src/features/Chat/components/VideoReferenceTooltip.tsx` | 89 | Inline mention tooltip via `VideoPreviewTooltip mode="mini"` |
| `src/components/ui/atoms/CopyButton.tsx` | 44 | Relocated from ChatMessageList, extended API |
| `src/components/ui/atoms/PortalTooltip.tsx` | 653 | `fixedDimensions` prop (deprecated `fixedWidth`/`estimatedHeight` removed) |
| `src/core/utils/formatUtils.ts` | 72 | `formatDelta()`, `getDeltaColor()` shared utilities |

### Удалённые файлы

- `VideoTooltipContent.tsx` (был в `Chat/components/`) — заменён `VideoPreviewTooltip mode="mini"`

### Тесты

| Файл | Кейсов | Покрытие |
|---|---|---|
| `buildToolVideoMap.test.ts` | 21 | Все 7 extractors, delta merge, channelName fallback, edge cases |
| `toolCallGrouping.test.ts` | 11 | searchDatabase videoIds, labels, isExpandable |
