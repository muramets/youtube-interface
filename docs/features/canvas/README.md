# Canvas — Визуальная доска для анализа видео

## Текущее состояние

Полноэкранная бесконечная доска с pan/zoom, на которой пользователь размещает видео-карточки, traffic source карточки, заметки и изображения. Мульти-страничная (tabs). Real-time Firestore sync. Undo/Redo (50 уровней). Edge connections между нодами. Snap-to-align guides. LOD-система (3 уровня детализации при зуме). Per-node insights (packaging/visual/music). Интеграция с AI Chat через Canvas Context Bridge.

---

## Что это и зачем

Представь пробковую доску, на которую ты прикрепляешь карточки со своими видео, видео конкурентов и источниками трафика. Можешь двигать их, группировать, рисовать связи, делать заметки. Только эта доска — бесконечная, цифровая и синхронизируется в облаке.

**Зачем:** видео на YouTube не существуют в вакууме. Они связаны друг с другом через алгоритм рекомендаций. Canvas позволяет визуально увидеть эти связи — какие видео конкурентов приводят трафик к твоим, как группируются по нишам, какие паттерны повторяются.

---

## User Flow

### Добавление видео на Canvas

Видео попадают на Canvas **только через явное действие** пользователя — кнопку в Floating Bar:

```
Выделить видео на странице (Home, Playlists, Traffic, Trends)
       |
       v
Floating Bar появляется → кнопка Canvas (иконка сетки)
       |
       v
CanvasPageSelector → выбрать страницу Canvas
(1 страница = прямое добавление, 2+ = dropdown)
       |
       v
canvasStore.addNodeToPage(data[], pageId)
       |
       ├── Та же страница → addNode() → pending placement (позиция = null)
       |                                → useCanvasPlacement авто-расставляет
       |
       └── Другая страница → Firestore read-modify-write
                            (без undo, без pending glow)
```

### Другие способы создания нод

- **Double-click** на пустом Canvas → sticky note в точке клика
- **Cmd+V** / **Cmd+Opt+V** → вставка/перенос скопированных нод (clipboard)
- **Paste image** из буфера ОС → image node (placeholder → upload → URL)

### Работа на Canvas

- **Pan:** перетаскивание пустого пространства
- **Zoom:** колесо мыши (0.1x — 4x)
- **Select:** клик по ноде (Shift = мульти-выбор) или Shift+drag = marquee selection
- **Move:** перетаскивание выбранных нод (snap-to-align guides)
- **Connect:** клик по handle ноды → протянуть к другой ноде → edge
- **Edit note:** двойной клик по sticky note → TipTap Markdown editor
- **Insights:** hover на traffic source → sparkle badge → 3 категории (packaging/visual/music) → editable popover

---

## 5 типов нод

| Тип | Визуал | Откуда попадает | Данные |
|-----|--------|----------------|--------|
| **video-card** | Вертикальная карточка с обложкой, названием, метриками | Home, Playlists, Trends Floating Bars | VideoCardContext |
| **traffic-source** | Горизонтальная карточка с traffic метриками, niche badge | Traffic tab Floating Bar | TrafficSourceCardData |
| **sticky-note** | Цветная заметка (6 цветов), Markdown | Double-click на Canvas | StickyNoteData |
| **image** | Изображение с сохранением пропорций | Paste из буфера ОС | ImageNodeData |
| **snapshot-frame** | Визуальная рамка-контейнер (не нода!) | Автоматически при добавлении traffic sources | Computed from snapshotMeta |

### Snapshot Frames

Когда traffic source карточки добавляются на Canvas, они автоматически группируются в **snapshot frames** — визуальные рамки. Группировка по ключу `(sourceVideoId, snapshotId)`: все traffic sources одного snapshot'а одного видео попадают в один frame.

Frame показывает:
- Заголовок: название source video + label snapshot'а
- Discrepancy tooltip: Long Tail данные (если есть в CSV Total Row)
- Traffic sources внутри стэкаются вертикально

Frames — **перетаскиваемые** (drag за title bar двигает все дочерние ноды вместе).

---

## Страницы (Multi-Page)

Canvas поддерживает несколько страниц (tabs):
- Каждая страница — отдельный Firestore документ с nodes, edges, viewport
- Tabs вверху Canvas: переключение, создание, переименование, удаление
- Нельзя удалить последнюю страницу
- Undo/Redo — per-page (отдельный стэк для каждой)
- Clipboard переживает переключение страниц (Copy на стр. 1 → Paste на стр. 2)

---

## Persistence (Firestore)

Canvas синхронизируется с Firestore в реальном времени:

- **Debounced save:** 1.5 секунды после мутации (drag, edit, add)
- **Immediate flush:** при закрытии Canvas или переключении страницы
- **onSnapshot listener:** получает обновления от других вкладок/устройств
- **Merge strategy:** локальные dirty nodes и pending nodes имеют приоритет

Каждая страница хранится как отдельный Firestore doc, что позволяет подписываться только на активную страницу.

---

## Дополнительные подсистемы

### LOD (Level of Detail)

При отдалении ноды упрощаются для производительности:

| Уровень | Zoom | Отображение |
|---------|------|-------------|
| **Full** | >= 0.53 | Полная карточка: обложка, метрики, handles |
| **Medium** | 0.28 — 0.47 | Обложка + название |
| **Minimal** | < 0.22 | Только иконка |

Hysteresis (±0.03) предотвращает мерцание на границе уровней.

### Edge System (связи между нодами)

- 4 handle-точки на каждой ноде (top, right, bottom, left)
- Drag от handle → rubber-band → snap на целевой handle → создать edge
- Edge стили: solid, dashed, dotted + цвет + label
- Cmd+Click по edge → подсветка (connected nodes яркие, остальные dim)
- Dedup: нельзя создать два одинаковых edge

### Snap-to-Align Guides

Живые направляющие при drag нод — выравнивание по краям и центрам соседних нод/frames. Работает аналогично Figma/Sketch.

### Per-Node Insights

Traffic source ноды могут иметь заметки в 3 категориях:
- **Packaging** (amber) — обложка, название, описание
- **Visual** (purple) — монтаж, эффекты, цветокоррекция
- **Music** (pink) — выбор музыки, фон

Заметки можно **пинить** → они появляются в GlobalInsightsBar вверху Canvas.

### Undo/Redo

Ring buffer, 50 уровней на страницу. Snapshot = nodes + edges. Клавиши Cmd+Z / Cmd+Shift+Z.

### Viewport Culling

Рендерятся только ноды, видимые в текущем viewport. При 200+ нодах это критично для производительности.

---

## Как видео попадает на Canvas — полный pipeline

Рассмотрим конкретный сценарий: пользователь на странице Playlists выделяет 3 видео и добавляет на Canvas.

### 1. Выделение

`videoSelectionStore` запоминает выделенные ID в scope `playlists`:
```
selections: { playlists: Set(['vid1', 'vid2', 'vid3']) }
```

### 2. Floating Bar

`VideoSelectionFloatingBar` появляется. Пользователь нажимает кнопку Canvas → открывается `CanvasPageSelector`.

### 3. CanvasPageSelector

- Если 1 страница → сразу добавляет
- Если 2+ → dropdown с чекмарками (показывает, какие видео уже есть на каждой странице)
- Можно создать новую страницу прямо из dropdown

### 4. useAddToCanvas

Hook резолвит ID → video objects → `VideoCardContext`:
```
videoIds → videos.filter(match) → sort by publishedAt → videoToCardContext()
```

### 5. canvasStore.addNodeToPage()

**Та же страница:**
- Для каждого data → `addNode(data)` → `createCanvasNode(data, null, existingNodes)`
- Node создаётся с `position: null` (pending placement)
- Pending nodes подсвечиваются glowing border

**Другая страница:**
- Firestore `getDoc` → прочитать существующие nodes
- `createCanvasNode()` для каждого нового
- Firestore `setDoc` с merge → записать

### 6. Auto-Placement (useCanvasPlacement)

`useCanvasPlacement` детектит pending nodes (`position === null`) и запускает **event-driven pipeline**:

```
1. Wait 1 rAF       — React коммитит DOM, parent ноды рендерятся
2. placePendingNodes — расставляет с estimate-размерами
3. Wait SizeBatcher  — ResizeObserver замеряет реальные высоты
4. relayoutChildren  — корректирует позиции по замеренным высотам
```

Это заменяет наивный подход "подожди 4 rAF и надейся" на **data-driven**: relayout срабатывает когда размеры реально замерены, а не через фиксированное время.

#### Стратегии placement по типу ноды

**Traffic-source ноды (frame-aware placement):**
Самый сложный случай. `framePlacementEngine` группирует pending traffic nodes по `(sourceVideoId, snapshotId)` — каждая группа становится вертикальной колонкой в snapshot frame:

```
Parent Video Card
       |
       v
  ┌─ Frame "Snapshot Jan 2024" ─┐  ┌─ Frame "Snapshot Feb 2024" ─┐
  │  Traffic Source 1            │  │  Traffic Source 4            │
  │  Traffic Source 2            │  │  Traffic Source 5            │
  │  Traffic Source 3            │  │                              │
  └──────────────────────────────┘  └──────────────────────────────┘
```

- **Append** — если frame с таким ключом уже существует, новые ноды стэкаются снизу
- **New column** — если frame новый, размещается правее существующих frames
- Frames выравниваются по верхнему краю последнего существующего frame

**Video-card ноды:**
- **Own-channel** (`own-draft`, `own-published`) → "Right Lane": правее всех существующих нод, в ряд
- **Competitor** → "Top Shelf": над существующими нодами, в ряд
- Baselines вычисляются из bounding box уже размещённых нод

**Sticky notes:**
- Рядом с последней нодой, над которой был курсор (`lastHoveredNode`)
- Или в позиции курсора (`lastCanvasWorldPos`)
- Или на shelf, если курсор не отслеживался
- Collision detection: `findFreeSpot()` сдвигает заметку, если она пересекается с существующими нодами

#### Parent Reflow (auto-width)

После placement traffic sources, parent video card может оказаться уже, чем её дети. `computeParentReflow()`:
1. Считает ширину самого широкого дочернего frame
2. Расширяет parent до `max(childrenWidth, originalWidth)`
3. Вычисляет `displacement` (сдвиг) для всех нод, чтобы сохранить относительные позиции

#### Grow-Up

Когда parent расширяется → его высота может измениться (текст перестроится). `computeGrowUpDisplacements()` корректирует Y-позицию parent, чтобы нижний край остался на месте, а ноды "выросли вверх".

### 7. SizeBatcher + relayoutChildren

`SizeBatcher` батчит вызовы `ResizeObserver` (десятки нод за один кадр) и вызывает flush callback с полным batch. После flush:

`relayoutChildren()` выполняет 3 прохода:
1. **Frame columns** — корректирует вертикальные позиции внутри frames по замеренным высотам
2. **Non-framed children** — корректирует позиции нод без frame
3. **Parent reflow** — повторный расчёт ширин parent с учётом реальных размеров

#### Cross-tab sync

Когда пользователь возвращается на вкладку из фона, `visibilitychange` listener проверяет pending nodes (добавленные из другой вкладки через Firestore) и запускает тот же pipeline.

### 8. Firestore Save

Debounced save (1.5s) записывает финальные позиции в Firestore. Другие вкладки получают update через onSnapshot.

---

## Roadmap

### Реализовано
- [x] Infinite pan/zoom board
- [x] 5 типов нод (video-card, traffic-source, sticky-note, image, snapshot-frame)
- [x] Multi-page tabs
- [x] Edge connections (4 handles, rubber-band, snap, styles)
- [x] Snap-to-align guides
- [x] LOD (3 уровня)
- [x] Per-node insights (packaging/visual/music + pin to global bar)
- [x] Undo/Redo (50 уровней per-page)
- [x] Copy/Paste/Move (cross-page, cross-channel)
- [x] Firestore persistence (debounced + real-time sync)
- [x] Viewport culling
- [x] Canvas Context Bridge → AI Chat
- [x] Auto-placement engine (frame-aware)
- [x] Marquee selection
- [x] Keyboard shortcuts (Esc, Cmd+Z, Cmd+V, Cmd+Opt+V)
- [x] Image paste from OS clipboard

### Будущее
- [ ] Drag-and-drop из списков напрямую на Canvas (без Floating Bar)
- [ ] Minimap для навигации по большому Canvas
- [ ] AI-assisted layout suggestions
- [ ] Export Canvas as image/PDF
- [ ] Collaborative editing (multi-user)

---

## Связанные docs

- [Context Bridges](../chat/context/bridges/README.md) — Canvas Bridge: выделение на Canvas → AI Chat
- [AI Chat](../chat/README.md) — общая архитектура чата
- [Suggested Traffic](../video-details/suggested-traffic/README.md) — источник traffic source данных

---

## Technical Implementation

### Store Architecture

Zustand store из 5 domain-scoped slices:

| Slice | Ответственность |
|-------|----------------|
| **NodesSlice** | CRUD нод, orphan cleanup, image upload |
| **EdgesSlice** | CRUD edges, pending edge (rubber-band) |
| **SelectionSlice** | Multi-select (Set<string>) |
| **LayoutSlice** | Placement engine, ResizeObserver batch, reflow |
| **ViewportSlice** | Pan/zoom camera state |

### Firestore Structure

```
users/{uid}/channels/{cid}/canvas/
  meta                  -- { pages: CanvasPageMeta[], activePageId, updatedAt }
  page_{uuid1}          -- { nodes, edges, viewport, snapshotMeta, title, updatedAt }
  page_{uuid2}          -- ...
```

### Key Files

**Store:**
- `src/core/stores/canvas/canvasStore.ts` — orchestrator, Firestore sync, pages, clipboard, undo/redo
- `src/core/stores/canvas/types.ts` — CanvasState, CanvasPageMeta, SnapshotMeta, PendingEdge
- `src/core/stores/canvas/slices/nodesSlice.ts` — node CRUD
- `src/core/stores/canvas/slices/edgesSlice.ts` — edge CRUD
- `src/core/stores/canvas/slices/selectionSlice.ts` — selection
- `src/core/stores/canvas/slices/layoutSlice.ts` — placement + size tracking
- `src/core/stores/canvas/slices/viewportSlice.ts` — pan/zoom
- `src/core/stores/canvas/constants.ts` — debounce timing, node sizes, undo limit

**Types:**
- `src/core/types/canvas.ts` — CanvasNode, CanvasEdge, CanvasNodeData, StickyNoteData, ImageNodeData

**Components:**
- `src/features/Canvas/CanvasOverlay.tsx` — full-screen orchestrator
- `src/features/Canvas/CanvasBoard.tsx` — pan/zoom workspace, marquee, cursor
- `src/features/Canvas/nodes/CanvasNodeWrapper.tsx` — positioned wrapper (drag, resize, LOD)
- `src/features/Canvas/nodes/VideoCardNode.tsx` — video card renderer
- `src/features/Canvas/nodes/TrafficSourceNode.tsx` — traffic source renderer
- `src/features/Canvas/nodes/StickyNoteNode.tsx` — sticky note with TipTap editor
- `src/features/Canvas/nodes/ImageNode.tsx` — image renderer
- `src/features/Canvas/nodes/SimplifiedNode.tsx` — minimal LOD
- `src/features/Canvas/nodes/MediumLodNode.tsx` — medium LOD
- `src/features/Canvas/frames/SnapshotFrame.tsx` — visual frame border

**Edges & Handles:**
- `src/features/Canvas/edges/EdgeLayer.tsx` — SVG edge rendering + rubber-band
- `src/features/Canvas/edges/ConnectionHandles.tsx` — 4-side handle circles

**Insights:**
- `src/features/Canvas/insights/InsightButtons.tsx` — sparkle badge + category buttons
- `src/features/Canvas/insights/InsightPopover.tsx` — editable text + pin
- `src/features/Canvas/insights/GlobalInsightsBar.tsx` — pinned insights bar

**Toolbar:**
- `src/features/Canvas/toolbar/CanvasToolbar.tsx` — zoom, undo/redo controls
- `src/features/Canvas/toolbar/CanvasPageHeader.tsx` — page tabs
- `src/features/Canvas/toolbar/CanvasFloatingBar.tsx` — selection actions (align, Z-order, delete)
- `src/features/Canvas/components/CanvasPageSelector.tsx` — dropdown for choosing page

**Hooks:**
- `src/features/Canvas/hooks/useCanvasSync.ts` — Firestore subscription per-page + meta
- `src/features/Canvas/hooks/useCanvasPlacement.ts` — auto-place pending nodes
- `src/features/Canvas/hooks/useCanvasKeyboard.ts` — keyboard shortcuts
- `src/features/Canvas/hooks/useCanvasNicheSync.ts` — sync niche changes to traffic nodes
- `src/features/Canvas/hooks/useCanvasContextBridge.ts` — Canvas → Chat bridge
- `src/features/Canvas/hooks/useCanvasDataSync.ts` — sync video data changes
- `src/features/Canvas/hooks/useCanvasPanZoom.ts` — pan/zoom + animated fit
- `src/features/Canvas/hooks/useMarqueeSelection.ts` — Shift+drag rectangle selection
- `src/features/Canvas/hooks/useSnapGuides.ts` — snap-to-align engine

**Layout Utils:**
- `src/features/Canvas/utils/frameLayout.ts` — frame grouping + bounds
- `src/features/Canvas/utils/framePlacementEngine.ts` — frame-aware auto-placement
- `src/features/Canvas/utils/nodePlacement.ts` — video/note placement
- `src/features/Canvas/utils/parentReflow.ts` — uniform parent width
- `src/features/Canvas/utils/growUp.ts` — parent Y adjustment on resize
- `src/features/Canvas/utils/SizeBatcher.ts` — batched ResizeObserver
- `src/features/Canvas/utils/snapEngine.ts` — snap-to-align math
- `src/features/Canvas/geometry/viewportCulling.ts` — visibility check

**Entry Point (from other pages):**
- `src/features/Video/hooks/useAddToCanvas.ts` — shared "Add to Canvas" action
