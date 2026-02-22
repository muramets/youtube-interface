# Canvas — Бесконечная доска для работы с контекстом

## Концепция

Canvas — это бесконечная доска (infinite workspace) в стиле Miro, которая разворачивается поверх приложения. На доску можно перетаскивать контекст из приложения (видео, suggested traffic, плейлисты) точно так же, как сейчас они перетаскиваются в Chat. Canvas сохраняет данные **per channel** — у каждого канала YouTube своя доска.

> [!IMPORTANT]
> Ключевое отличие от Chat: Chat — это **линейный** инструмент (вопрос → ответ). Canvas — это **пространственный** инструмент (раскладывай, группируй, рисуй связи).

---

## Как будет выглядеть

### Кнопка "Canvas"

- Рядом с Chat Bubble (слева от неё) появляется вторая кнопка — **Canvas**
- Иконка: `LayoutGrid` или `PanelTopOpen` из lucide-react (согласуем при ревью)
- Fade-in с задержкой 600ms (как Chat Bubble)
- При наведении — indigo glow (как у Chat Bubble)

````carousel
```
╭────────────────────────────────────╮
│          Приложение                │
│                                    │
│                                    │
│                                    │
│                                    │
│                                    │
│                                    │
│                    [Canvas] [Chat]  │  ← Два FAB в правом нижнем углу
╰────────────────────────────────────╯
```
<!-- slide -->
```
╭────────────────────────────────────╮
│ ┌────────────────────────────────┐ │
│ │ ✕  Channel Name — Canvas    🔍│ │  ← Тулбар (blur + border)
│ ├────────────────────────────────┤ │
│ │                                │ │
│ │    ┌─────┐        ┌─────┐     │ │  ← Карточки контекста
│ │    │Video│───────→ │Video│     │ │     + связи между ними
│ │    └─────┘        └─────┘     │ │
│ │          ┌──────────────┐     │ │
│ │          │ Suggested    │     │ │  ← Suggested Traffic блок
│ │          │ Traffic Data │     │ │
│ │          └──────────────┘     │ │
│ │                                │ │
│ │              ─ Mini-map ─      │ │  ← Mini-map (bottom-right)
│ └────────────────────────────────┘ │
│                    [Canvas] [Chat]  │
╰────────────────────────────────────╯
```
````

### Анимация открытия

Canvas разворачивается **из правого нижнего угла** (от позиции кнопки) на весь экран:
1. Кнопка Canvas нажата → scale(0.3) + opacity(0) → scale(1) + opacity(1)
2. `transform-origin: bottom right` — тот же паттерн, что и у ChatPanel
3. Длительность: 300ms, cubic-bezier(0.16, 1, 0.3, 1) — как все анимации в приложении
4. Backdrop: semi-transparent overlay `bg-bg-primary/95 backdrop-blur-sm`

### Тулбар (верхняя панель)

- **Слева**: кнопка закрытия (✕) + название канала + "Canvas"
- **Центр**: Zoom controls (−, %, +) + Fit to content
- **Справа**: Mini-map toggle

Стиль — glassmorphism: `bg-card-bg/80 backdrop-blur-md border-b border-border`

### Карточки на доске

Карточки контекста на доске повторяют **те же визуальные стили**, что и в приложении:

| Тип контекста | Визуальное представление | Источник |
|---------------|--------------------------|----------|
| Video Card | Thumbnail + title + метаданные | Playlists, Home |
| Suggested Traffic | Source video + таблица suggested видео (компактная) | Trends → Suggested Traffic |
| (Будущее) Music Track | Обложка + название + waveform preview | Music |

Каждая карточка:
- Перетаскивается по доске (drag & drop)
- Имеет header с drag handle и кнопкой удаления
- Показывает тип контекста через цветной индикатор (badge)
- При наведении — subtle elevation (`shadow-lg` → `shadow-xl`)

### Интерактив на доске

**MVP (Phase 1):**
- ✅ Pan (перемещение холста — drag пустого пространства или wheel)
- ✅ Zoom (колесо мыши + Ctrl, или pinch на трекпаде)
- ✅ Перетаскивание карточек
- ✅ Удаление карточек
- ✅ Auto-persist позиций в Firestore

**Phase 2 (по желанию):**
- ⬜ Связи между карточками (connections/arrows)
- ⬜ Sticky notes (текстовые заметки)
- ⬜ Multi-select + group move
- ⬜ Shared canvases (collaboration)

---

## Подробнее: Как контекст попадает на Canvas

### Drag & Drop из приложения (Primary flow)

Точно как сейчас работает drag в Chat — пользователь выделяет видео/трафик → drag → drop на открытый Canvas **или** на кнопку Canvas (если Canvas закрыт):

1. Пользователь выделяет контекст (видео, suggested traffic)
2. Начинает drag. Если Canvas закрыт — при перетаскивании над кнопкой Canvas она подсвечивается (drop zone indicator)
3. Drop → Canvas создаёт карточку в центре видимой области (или в точке drop)

> [!TIP]
> Переиспользуем существующий [AppContextItem](file:///Users/muramets/Documents/youtube-interface/src/core/types/appContext.ts#82-83) union type и `appContextStore` — обе системы (Chat и Canvas) работают с одним и тем же форматом контекста. Никаких новых типов данных для MVP.

### Кнопка "Add to Canvas" (Secondary flow)

На каждом контекстном элементе (видео карточка, строка suggested traffic) можно добавить вторую action кнопку "→ Canvas" рядом с существующей "→ Chat". Это Phase 2.

---

## Данные и Persistence

### Firestore Structure

```
users/{userId}/channels/{channelId}/canvas/
  └── default/                  ← Single canvas doc per channel (MVP)
        ├── nodes: [            ← Array of canvas nodes
        │     {
        │       id: string,
        │       type: 'video-card' | 'suggested-traffic',
        │       data: AppContextItem,   ← Same type as chat context
        │       position: { x: number, y: number },
        │       size: { w: number, h: number },  ← Optional custom size
        │       createdAt: Timestamp,
        │     }
        │   ]
        ├── viewport: { x, y, zoom }   ← Saved camera position
        └── updatedAt: Timestamp
```

> [!NOTE]
> Используем **один документ** на канал (не коллекцию подчинённых документов). Для MVP количество нод < 100, и один документ Firestore ≤ 1MB — более чем достаточно. Это упрощает подписку (`onSnapshot` на один doc) и persistence (один `setDoc`).

### Debounced Save

Позиции нод и viewport сохраняются с debounce 1500ms (как [usePanelGeometry](file:///Users/muramets/Documents/youtube-interface/src/features/Chat/hooks/usePanelGeometry.ts#83-318) сохраняет геометрию Chat Panel в localStorage, но здесь — в Firestore).

---

## Техническая архитектура

### Новые файлы

```
src/features/Canvas/
├── CanvasBubble.tsx            ← FAB кнопка (аналог ChatBubble)
├── CanvasOverlay.tsx           ← Full-screen overlay container
├── CanvasToolbar.tsx           ← Top toolbar (close, zoom, etc.)
├── CanvasBoard.tsx             ← Infinite canvas (pan, zoom, render nodes)
├── CanvasMinimap.tsx           ← Mini-map widget (bottom-right)
├── Canvas.css                  ← Animations (entry, glow, grid pattern)
├── components/
│   ├── CanvasNode.tsx          ← Universal node wrapper (drag, resize, delete)
│   ├── VideoCardNode.tsx       ← Video card renderer on canvas
│   └── SuggestedTrafficNode.tsx← Suggested traffic renderer on canvas
├── hooks/
│   ├── useCanvasViewport.ts    ← Pan, zoom, wheel, pinch-to-zoom
│   ├── useCanvasNodes.ts       ← Node CRUD + drag positions
│   └── useCanvasDropZone.ts    ← Drop zone for AppContextItems
└── store/
    └── canvasStore.ts          ← Zustand store + Firestore sync
```

### Переиспользование

| Что переиспользуем | Откуда |
|---------------------|--------|
| [AppContextItem](file:///Users/muramets/Documents/youtube-interface/src/core/types/appContext.ts#82-83) types | [core/types/appContext.ts](file:///Users/muramets/Documents/youtube-interface/src/core/types/appContext.ts) |
| `appContextStore` | [core/stores/appContextStore.ts](file:///Users/muramets/Documents/youtube-interface/src/core/stores/appContextStore.ts) — source of DnD context |
| [useFloatingBottomOffset](file:///Users/muramets/Documents/youtube-interface/src/core/hooks/useFloatingBottomOffset.ts#25-66) | `core/hooks/` — positioning Canvas FAB |
| [usePanelGeometry](file:///Users/muramets/Documents/youtube-interface/src/features/Chat/hooks/usePanelGeometry.ts#83-318) patterns | Паттерн debounced persist + clamp |
| Tailwind design tokens | Все CSS variables, z-index scale |
| `z-panel (400)` | Z-index уровень для Canvas overlay |
| Firestore patterns | [chatStore.ts](file:///Users/muramets/Documents/youtube-interface/src/core/stores/chatStore.ts) → `onSnapshot`, optimistic updates |
| lucide-react иконки | Universal icon system |
| `ConfirmationModal` | Delete confirmation |

### Z-Index решение

Canvas overlay занимает `z-panel (400)` — тот же уровень, что и Chat Panel. Поскольку Canvas — **полноэкранный** overlay, он визуально покрывает всё. Chat Bubble остаётся видимым (z-sticky: 100 < z-panel, но Chat включает свой overlay с z-panel при открытии). **Canvas и Chat не могут быть открыты одновременно** — открытие одного закрывает другой. Это проще для MVP и избавляет от z-index конфликтов.

---

## Вопросы для обсуждения

1. **Canvas и Chat одновременно?** В MVP предлагаю взаимоисключающее поведение (как в Notion — либо Canvas, либо Chat). Нужна ли возможность использовать оба одновременно?

2. **Scope Phase 1**: устраивает ли MVP из секции "Интерактив" (pan, zoom, drag nodes, delete, persist) без connections и sticky notes?

3. **Иконка**: предпочтение по иконке для Canvas FAB? Варианты: `LayoutGrid`, `Frame`, `PanelTopOpen`, `Layers` (lucide-react).

4. **Drop на закрытый Canvas**: при drag-over над Canvas FAB — автоматически открывать Canvas и дропать? Или только как drop zone indicator (подсветка) + создание ноды, которая появится при следующем открытии?

---

## Verification Plan

### Automated Tests
- `npm run lint` + `npx tsc --noEmit` — проверка типов и линтинг после имплементации

### Browser Testing (через browser_subagent)
1. Открыть приложение → проверить наличие Canvas FAB рядом с Chat Bubble
2. Кликнуть Canvas FAB → проверить анимацию развёртывания overlay
3. Перетащить видео на Canvas → проверить создание карточки
4. Pan и Zoom на пустом Canvas → проверить плавность
5. Переключить канал → проверить что Canvas загружает другие данные
6. Перезагрузить страницу → проверить persistence (карточки и viewport на месте)

### Manual Verification (User)
- Визуальное качество анимаций и дизайна
- Ощущения от pan/zoom на трекпаде
- DnD из Trends → Canvas
