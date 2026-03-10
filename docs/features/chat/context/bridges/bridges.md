# Context Bridges — 4 моста в деталях

## Общий паттерн

Все 4 моста следуют одной и той же схеме:

```
1. Читай selection state из своего источника
2. Проверь: если isBridgePaused → выход
3. Проверь: если selection пуст → выход (sticky behavior)
4. Маппинг: domain data → AppContextItem
5. Dedup: сравни с текущим слотом, добавь только новое
6. setSlot(source, mergedItems)
```

Различия — в источнике данных, маппинге и стратегии dedup.

---

## Selection Bridge

**Слот:** `playlist`
**Страницы:** Home, Playlists, PlaylistDetail
**Тип данных:** `VideoCardContext`

### Что делает

Наблюдает за глобальным `videoSelectionStore` — единым store для выделения видео на всех страницах с плейлистами. Каждая страница пишет ID выделенных видео в свой "scope" этого store, а мост собирает ВСЕ scope'ы и преобразует ID → полные `VideoCardContext` через `videoToCardContext()`.

### Откуда берёт данные

- `videoSelectionStore.selections` — `Record<scope, Set<string>>` с ID выделенных видео
- `useVideos()` — полный список видео пользователя (Firestore)
- `channelStore.currentChannel?.name` — для `channelTitle`

### Dedup-стратегия

Читает текущий `slots.playlist`, собирает `Set<videoId>` существующих, добавляет только те, чьих ID ещё нет. Новые items получают `addedAt: Date.now()` для хронологической нумерации.

### Где подключён

- `HomePage.tsx` — `useSelectionContextBridge()`
- `PlaylistsPage.tsx` — `useSelectionContextBridge()`
- `PlaylistDetailPage.tsx` — `useSelectionContextBridge()`

Один и тот же hook вызывается на всех трёх страницах. Он shared — работает с глобальным selection store, не привязан к конкретной странице.

---

## Traffic Bridge

**Слот:** `traffic`
**Страница:** Video Details > Traffic tab
**Тип данных:** `SuggestedTrafficContext`

### Что делает

Самый сложный мост. Собирает enriched данные из нескольких источников:
- CSV metrics (impressions, CTR, views, avg duration, watch time)
- YouTube API enrichment (thumbnail, channel, description, tags, duration)
- Smart Assistant labels (trafficType, viewerType, niche)
- Snapshot metadata (date, label)
- Long Tail discrepancy

Результат — один `SuggestedTrafficContext` объект, содержащий source video + массив selected suggested videos.

### Откуда берёт данные

- `selectedIds` — выделенные строки таблицы
- `filteredSources` — отфильтрованные traffic sources (CSV data)
- `allVideos` — кэш YouTube API enrichment
- `allAssignments`, `allNiches` — Smart Assistant niche assignments
- `trafficEdges`, `viewerEdges` — Smart Assistant label assignments
- `_video` — source video (видео пользователя, чей трафик анализируется)
- `trafficData.snapshots` — список snapshot'ов
- `computedDiscrepancy` — вычисленный Long Tail

### Dedup-стратегия

Accumulative по ключу `sourceVideo.videoId + snapshotId`: при обновлении выделения **заменяет** контекст с тем же source video + snapshot, а контексты от других видео/snapshot'ов сохраняет.

### Где подключён

Inline `useEffect` в `TrafficTab.tsx` (строки 576-676). Не вынесен в отдельный hook, потому что зависит от множества локальных переменных TrafficTab.

---

## Canvas Bridge

**Слот:** `canvas`
**Страница:** Canvas Overlay
**Тип данных:** `CanvasSelectionContext`

### Что делает

Маппит выделенные Canvas-ноды в единый `CanvasSelectionContext` с массивом `CanvasContextNode[]`. Поддерживает 5 типов нод:

| Тип ноды Canvas | Тип контекста | Что передаёт |
|----------------|---------------|-------------|
| video-card | `VideoContextNode` | Метаданные видео (title, views, tags, ownership) |
| traffic-source | `TrafficSourceContextNode` | Traffic metrics + YouTube enrichment + labels |
| sticky-note | `StickyNoteContextNode` | Текст заметки + цвет (пустые пропускаются) |
| image | `ImageContextNode` | URL изображения + alt text |
| snapshot-frame | `SnapshotFrameContextNode` | Синтезируется из traffic-source нод (snapshot metadata + discrepancy) |

### Синтез Snapshot Frame нод

`SnapshotFrameContextNode` — особый случай. Они НЕ выделяются напрямую. Мост сам определяет, к каким snapshot frame'ам принадлежат выделенные traffic-source ноды, и синтезирует frame-level контекст (snapshot label, source video title, discrepancy data, count). Это даёт AI фрейм для интерпретации: "эти 12 traffic sources — из snapshot'а 'Before title change' видео 'My Video', с Long Tail 34%".

### Условия работы

- Canvas overlay должен быть **открыт** (`isOpen === true`)
- Chat должен быть **открыт** (`chatIsOpen === true`)
- При открытии чата — сброс tracking'а предыдущего выделения, чтобы текущее выделение загрузилось сразу

### Dedup-стратегия

Плоский merge по identity key каждой ноды (`video:{videoId}`, `traffic:{videoId}`, `sticky:{content}`, `image:{imageUrl}`, `frame:{snapshotId}`). Все ноды хранятся в одном `CanvasSelectionContext` в слоте — при каждом новом выделении новые ноды добавляются к существующим.

### Где подключён

`CanvasOverlay.tsx` — `useCanvasContextBridge(isOpen)`

---

## Trends Bridge

**Слот:** `trends`
**Страница:** Trends
**Тип данных:** `VideoCardContext` (с `ownership: 'competitor'`)

### Что делает

Самый простой мост. Конвертирует `TrendVideo` (внутренний тип Trends) в `VideoCardContext` через `trendVideoToCardContext()`. Все видео помечаются как `competitor`.

### Откуда берёт данные

- `selectedIds: Set<string>` — выделенные ID из Trends selection state
- `videos: TrendVideo[]` — отфильтрованный список competitor видео

### Dedup-стратегия

Читает текущий `slots.trends`, собирает `Set<videoId>`, добавляет только новые. Новые items получают `addedAt: Date.now()` для хронологической нумерации.

### Где подключён

`TrendsPage.tsx` — `useTrendsContextBridge(selectionState.selectedIds, filteredVideos)`

---

## UI-компоненты

### ContextAccordion

Shared компонент отображения контекста. Используется в двух местах:
- **ChatInput** (pre-send) — expanded по умолчанию, с кнопками remove/clear
- **PersistedContextBar** (memory) — collapsed по умолчанию, read-only (без remove)

Рендерит items по семантическим группам (не по слотам-источникам):
1. **My Videos** — `own-draft` + `own-published` video cards, отсортированные по `addedAt`
2. **Competitors** — `competitor` video cards, отсортированные по `addedAt`
3. **Suggested Traffic** — `SuggestedTrafficContext` → `SuggestedTrafficChip`
4. **Canvas** — `CanvasSelectionContext` → `CanvasSelectionChip`

Заголовки групп показываются когда видимы 2+ группы. Auto-scroll к новым items при добавлении.

### ContextBridgeToggle

Кнопка Link/Unlink в ChatInput toolbar:
- **Link** (зелёная, `emerald-400`) — мосты активны
- **Unlink** (янтарная, `amber-400`) — мосты на паузе

Вызывает `appContextStore.toggleBridgePause()`.

### PersistedContextBar

Read-only аудит: показывает accumulated контекст беседы (из Firestore `persistedContext`). Без кнопок удаления — мутации сломали бы `mention://` ссылки в предыдущих сообщениях.

---

## Technical Implementation

**Selection Bridge:** `src/features/Video/hooks/useSelectionContextBridge.ts`
**Traffic Bridge:** `src/pages/Details/tabs/Traffic/TrafficTab.tsx` (строки 576-676)
**Canvas Bridge:** `src/features/Canvas/hooks/useCanvasContextBridge.ts`
**Trends Bridge:** `src/pages/Trends/hooks/useTrendsContextBridge.ts`
**ContextAccordion:** `src/features/Chat/components/ContextAccordion.tsx`
**ContextBridgeToggle:** `src/features/Chat/ChatInput.tsx` (строки 39-57)
**PersistedContextBar:** `src/features/Chat/components/PersistedContextBar.tsx`
**Chips:** `src/features/Chat/VideoCardChip.tsx`, `SuggestedTrafficChip.tsx`, `CanvasSelectionChip.tsx`
**Video Adapters:** `src/core/utils/videoAdapters.ts` (`videoToCardContext`, `trendVideoToVideoCardContext`)

---

## Связанные docs

- [README (обзор, user flow)](./README.md)
- [Architecture (slot system, types)](./architecture.md)
- [Enrichment Pipeline](./enrichment-pipeline.md)
