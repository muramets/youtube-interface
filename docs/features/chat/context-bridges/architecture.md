# Context Bridges — Архитектура

## Обзор

Система построена на паттерне **source-scoped slots**: каждый мост пишет в свой изолированный слот, мосты не могут перезаписать данные друг друга. Все слоты объединяются в плоский массив для Chat.

```
┌────────────┐  ┌────────────┐  ┌──────────────┐  ┌────────────┐
│   Home /   │  │  Traffic   │  │    Canvas    │  │   Trends   │
│  Playlists │  │    Tab     │  │   Overlay    │  │    Page    │
└─────┬──────┘  └─────┬──────┘  └──────┬───────┘  └─────┬──────┘
      │               │               │               │
  useSelection    useEffect       useCanvas        useTrends
  ContextBridge   (inline)        ContextBridge    ContextBridge
      │               │               │               │
      v               v               v               v
┌─────────────────────────────────────────────────────────────┐
│              appContextStore (Zustand)                       │
│                                                             │
│  slots: {                                                   │
│    playlist: AppContextItem[]     -- Selection Bridge       │
│    traffic:  AppContextItem[]     -- Traffic Bridge         │
│    canvas:   AppContextItem[]     -- Canvas Bridge          │
│    trends:   AppContextItem[]     -- Trends Bridge          │
│  }                                                          │
│                                                             │
│  slotTimestamps: Record<ContextSource, number>              │
│  isBridgePaused: boolean                                    │
│                                                             │
│  selectAllItems() -- flat merge всех слотов (хронологически)│
└─────────────────────────────────────────────────────────────┘
```

---

## Slot System (4 слота)

Каждый слот — массив `AppContextItem[]`. Слоты не знают друг о друге.

| Слот | Тип данных в слоте | Мост-писатель |
|------|-------------------|--------------|
| `playlist` | `VideoCardContext[]` | Selection Bridge |
| `traffic` | `SuggestedTrafficContext[]` | Traffic Bridge |
| `canvas` | `CanvasSelectionContext[]` (один элемент с массивом nodes) | Canvas Bridge |
| `trends` | `VideoCardContext[]` | Trends Bridge |

### Зачем слоты, а не один массив?

Без слотов мосты перезаписывали бы данные друг друга: Selection Bridge пишет 5 видео, потом Canvas Bridge пишет 3 ноды и затирает первые 5. Слоты решают эту проблему — каждый мост владеет своей "полкой".

### Хронологический порядок

`slotTimestamps` запоминает момент первого касания каждого слота. При объединении (`selectAllItems`) слоты сортируются по времени — первым добавленный контекст показывается первым.

---

## Store API

### Запись (используют мосты)

- **`setSlot(source, items)`** — полная замена содержимого слота. При первом вызове записывает timestamp. Каждый мост вызывает `setSlot` со своим ключом, передавая уже deduplicated массив.

### Удаление (использует UI)

- **`clearSlot(source)`** — очистка одного слота (кнопка "Clear group" в ChatInput)
- **`clearAll()`** — очистка всех слотов (кнопка "Clear All")
- **`consumeAll()`** — очистка после отправки сообщения (контекст "потреблён")
- **`removeItem(predicate)`** — удаление конкретного item (кнопка X на chip)

### Модификация (использует UI)

- **`updateItem(predicate, patch)`** — патч item in-place (например, toggle `includeTrafficSources`)

### Глобальная пауза

- **`toggleBridgePause()`** — переключает `isBridgePaused`. Все мосты проверяют этот флаг в начале useEffect и выходят, если `true`.

### Чтение (использует Chat UI)

- **`selectAllItems(state)`** — standalone selector, объединяет все слоты в плоский массив, сортируя по timestamp. Используется с `useShallow` в React-компонентах для предотвращения бесконечных ре-рендеров.

---

## Система типов (Discriminated Union)

Все элементы контекста наследуют общий паттерн — discriminated union по полю `type`:

```
AppContextItem = VideoCardContext          (type: 'video-card')
               | SuggestedTrafficContext   (type: 'suggested-traffic')
               | TrafficSourceCardData     (type: 'traffic-source')
               | CanvasSelectionContext    (type: 'canvas-selection')
```

### VideoCardContext

Видео-карточка — метаданные выбранного видео. Используется в слотах `playlist` и `trends`.

Ключевые поля:
- `ownership`: `'own-draft'` | `'own-published'` | `'competitor'` — определяет группировку в system prompt и badge prefix в UI
- `videoId`, `title`, `thumbnailUrl` — идентификация и отображение
- `viewCount`, `publishedAt`, `duration` — метрики
- `delta24h`, `delta7d`, `delta30d` — рост просмотров (добавляется enrichment middleware перед отправкой в AI, не при создании)

### SuggestedTrafficContext

Группированный контекст из Traffic таблицы: source video + массив suggested videos + discrepancy.

Ключевые поля:
- `sourceVideo` — видео пользователя, рядом с которым YouTube показывает рекомендации
- `suggestedVideos: SuggestedVideoItem[]` — выбранные строки таблицы (CSV metrics + YouTube API enrichment + Smart Assistant labels)
- `discrepancy?: TrafficDiscrepancy` — расхождение между YouTube total и суммой видимых источников (Long Tail)
- `snapshotId`, `snapshotDate`, `snapshotLabel` — идентификация snapshot'а

### CanvasSelectionContext

Группа выбранных нод Canvas. Один элемент в слоте `canvas` содержит все выбранные ноды.

Вложенный union `CanvasContextNode`:
- `VideoContextNode` (nodeType: 'video') — видео на Canvas
- `TrafficSourceContextNode` (nodeType: 'traffic-source') — traffic source карточка
- `StickyNoteContextNode` (nodeType: 'sticky-note') — заметка пользователя
- `ImageContextNode` (nodeType: 'image') — прикреплённое изображение
- `SnapshotFrameContextNode` (nodeType: 'snapshot-frame') — рамка snapshot'а с discrepancy данными

### TrafficSourceCardData

Плоский тип для одной traffic source карточки (используется на Canvas как данные ноды). Отличается от `SuggestedTrafficContext` тем, что представляет одно видео, а не группу.

---

## Deduplication

Каждый тип имеет стабильный identity key для предотвращения дубликатов:

| Тип | Key | Пример |
|-----|-----|--------|
| `video-card` | `vc:{videoId}` | `vc:abc123` |
| `suggested-traffic` | `st:{sourceVideo.videoId}` | `st:xyz789` |
| `traffic-source` | `ts:{videoId}` | `ts:def456` |
| `canvas-selection` | `cs:{sorted node keys}` | `cs:video:a,traffic:b` |

Функция `getContextItemKey()` возвращает ключ для любого `AppContextItem`. Функция `mergeContextItems()` объединяет массивы, пропуская дубликаты.

Каждый мост **дополнительно** делает свою dedup-логику перед вызовом `setSlot` — читает текущее состояние слота и добавляет только новые элементы.

---

## Reference Map (нумерация видео для AI)

Когда контекст попадает в system prompt, каждое видео получает номер: `Video #1`, `Draft #2`, `Competitor #3`. Этот же номер отображается как badge на chip в ChatInput.

`buildReferenceMap()` — SSOT (single source of truth) для нумерации. Порядок обхода строго фиксирован:
1. Canvas video nodes (по ownership)
2. Standalone video cards (продолжая счётчик)
3. Traffic suggested videos (`suggested-1`, `suggested-2`, ...)

Этот порядок используется и в system prompt (`persistentContextLayer.ts`), и в UI (`ContextAccordion.tsx`), обеспечивая консистентность — AI говорит "Video #3", и пользователь видит badge #3 на том же видео.

---

## Technical Implementation

**Store:** `src/core/stores/appContextStore.ts`
**Types:** `src/core/types/appContext.ts`
**Reference Map:** `src/core/utils/buildReferenceMap.ts`
**Reference Patterns:** `src/core/config/referencePatterns.ts`

---

## Связанные docs

- [README (обзор, user flow)](./README.md)
- [4 моста в деталях](./bridges.md)
- [Enrichment Pipeline](./enrichment-pipeline.md)
