# Ambient Mode + Document Scroll Layout

> Переход приложения с app-shell scroll модели на document scroll + ambient visual эффект на Watch Page, где размытый thumbnail видео естественно проникает через header и sidebar.

## Текущее состояние

Ambient элемент уже реализован в `WatchPageVideoPlayer.tsx` — `<img>` с `blur-[60px] scale-[2] opacity-20/30`. Однако app-shell layout (три уровня `overflow-hidden/auto` на root, flex wrapper и `<main>`) обрезает эффект на границах компонентов. Ambient визуально не выходит за пределы `<main>`. Layout refactoring — необходимое условие для работы ambient mode.

---

## Что это такое

**Аналогия:** Представьте кинотеатр с подсветкой Ambilight — телевизор, который проецирует цвета экрана на стену за ним. Сейчас наше приложение — это TV в коробке: подсветка есть, но коробка обрезает её. Document scroll убирает коробку, и цвета из видео естественно растекаются по шапке, сайдбару и фону, создавая immersive experience как у YouTube, Netflix и Spotify.

**Зачем — два уровня ценности:**

1. **Document scroll (layout refactoring)** — приложение переходит на нативный скролл документа (как YouTube, Twitter, любой современный сайт). Это даёт: плавный мобильный скролл, работающий Ctrl+F, scroll restoration при навигации Back, более простая ментальная модель для разработки.

2. **Ambient mode (Watch Page)** — визуальный эффект, где размытый thumbnail видео создаёт цветное свечение, проникающее в header и sidebar. Работает только после layout refactoring, потому что `overflow: visible` должен пропускать элемент вверх по DOM.

---

## User Flow

### Document Scroll
- Пользователь скроллит любую страницу → используется нативный скролл браузера (не внутренний скролл `<main>`)
- Find-in-page (Ctrl+F) работает корректно
- Back navigation → браузер автоматически восстанавливает позицию скролла
- Sticky header остаётся на месте, sidebar остаётся на месте

### Ambient Mode (Watch Page)
1. Пользователь открывает `/watch/:id`
2. Размытый thumbnail видео (или custom image) мягко подсвечивает area вокруг плеера
3. Цветное свечение проникает в header (semi-transparent background) и sidebar
4. При навигации к другому видео — ambient обновляется с новым thumbnail
5. На других страницах ambient отсутствует, header имеет обычный `bg-bg-primary`

---

## Roadmap

### Stage 1 — Layout Refactoring (document scroll) `← YOU ARE HERE`

Изменить три CSS-класса в `App.tsx` для перехода с app-shell scroll на document scroll:
- Root div: `h-screen overflow-hidden` → `min-h-screen`
- Flex wrapper: убрать `overflow-hidden`
- Main: убрать `overflow-y-auto` (документ скроллится сам)

Обновить все scroll-зависимости: `document.querySelector('main').scrollTo()` → `window.scrollTo()`, sticky элементы, IntersectionObserver root, фиксированные высоты `h-[calc(100vh-56px)]`.

**Результат:** приложение работает идентично, но скроллит документ, а не `<main>`.

### Stage 2 — Ambient Mode

Header получает прозрачный фон на `/watch/` routes. Ambient `<img>` уже существует в `WatchPageVideoPlayer.tsx` и становится видимым автоматически после Stage 1 (нет `overflow` клиппинга).

**Результат:** цветное свечение от видео проникает в header и sidebar на Watch Page.

### Stage 3 — Market-ready (future)

- Canvas/Easel page: полноэкранный режим с собственным scroll containment
- Animated ambient: плавный crossfade при переключении видео
- User preference: toggle для ambient в Settings
- Performance: `will-change: transform`, conditional rendering на слабых устройствах
- Mobile: адаптация blur radius и opacity для маленьких экранов

---

## Technical Implementation

### Ключевые файлы

| Файл | Роль |
|------|------|
| `src/App.tsx` (lines 86, 105, 107) | Root layout — три CSS-класса для изменения |
| `src/components/Layout/Header.tsx` (line 62) | Header — `bg-bg-primary` → conditional transparency |
| `src/components/Layout/Sidebar.tsx` (line 318) | Sidebar — `sticky top-14 h-[calc(100vh-56px)]` |
| `src/features/Watch/WatchPage.tsx` (line 63-66) | scroll-to-top — `mainContainer.scrollTo(0, 0)` |
| `src/features/Watch/components/WatchPageVideoPlayer.tsx` (line 22-34) | Ambient `<img>` (already implemented) |

### Scroll-зависимости для аудита

**Direct `<main>` reference (MUST change):**
- `src/features/Watch/WatchPage.tsx:63-65` — `document.querySelector('main').scrollTo(0, 0)` → `window.scrollTo(0, 0)`

**Sticky elements inside `<main>` (MUST verify behaviour):**
- `src/pages/Home/components/CategoryBar.tsx:76` — `sticky top-0` — будет sticky относительно viewport (корректно)
- `src/pages/Trends/Header/TrendsHeader.tsx:55` — `sticky top-0` — внутри `h-full` flex child, может сломаться
- `src/pages/Playlists/PlaylistsPage.tsx:290` — `sticky top-0` — нужен `top-14` (высота header)
- `src/pages/Trends/Table/TrendsTable.tsx:123` — `<thead> sticky top-0` — внутри overflow-auto container (изолирован, OK)

**Pages with own scroll containers (isolated, probably safe):**
- `src/pages/Music/MusicPage.tsx:214` — `scrollContainerRef` для виртуализации — собственный `overflow-y-auto`
- `src/pages/Trends/Timeline/TimelineCanvas.tsx:302` — `overflow-hidden` + `h-[calc(100vh-56px)]` — изолирован
- `src/features/Chat/ChatMessageList.tsx:537` — `overflow-y-auto` — изолирован
- `src/pages/Details/tabs/Editing/` — timeline scroll — все ref-based, изолирован

**IntersectionObserver (default root = viewport, NOT `<main>`):**
- `src/pages/Details/tabs/Gallery/GalleryTab.tsx:192` — sentinel для shadow → default root (viewport) — корректно
- `src/pages/Details/tabs/Packaging/PackagingTab.tsx:105` — sentinel → default root — корректно
- `src/pages/Details/tabs/Traffic/TrafficTab.tsx:719` — sentinel → default root — корректно
- `src/features/Chat/ChatMessageList.tsx:231` — visibility tracking — default root — корректно

**Dropdown/Tooltip scroll listeners:**
- `src/components/ui/atoms/PortalTooltip.tsx:552` — `window.addEventListener('scroll', ...)` с `true` (capture) — будет работать, т.к. document scroll fires на window
- `src/components/ui/molecules/Dropdown.tsx:97` — `window scroll` capture — OK
- `src/features/Video/FilterDropdown.tsx:56` — `window scroll` capture — OK
- `src/features/Filter/FilterSortDropdown.tsx:79` — `window scroll` capture — OK

**Height calculations:**
- `src/components/Layout/Sidebar.tsx:318` — `h-[calc(100vh-56px)]` — sticky + fixed height = корректно при document scroll
- `src/pages/Trends/Timeline/TimelineCanvas.tsx:302` — `h-[calc(100vh-56px)]` — full viewport minus header — OK если parent не ограничивает

### Ambient Implementation

`WatchPageVideoPlayer.tsx` уже содержит рабочую реализацию:
```tsx
<img
    src={ambientSrc}
    className="absolute inset-0 w-full h-full object-cover blur-[60px] scale-[2] opacity-20 dark:opacity-30 pointer-events-none z-0"
    style={{ maskImage: '...', WebkitMaskImage: '...' }}
/>
```

После layout refactoring (убран `overflow-hidden/auto`) этот элемент автоматически станет видимым за пределами `<main>`.

### Header Transparency

На `/watch/` routes header получает semi-transparent background чтобы ambient цвета были видны через него:
- Default: `bg-bg-primary` (opaque)
- Watch page: `bg-bg-primary/80 backdrop-blur-xl` (semi-transparent с blur)
- Header уже принимает `className` prop — можно передать из `App.tsx` на основе route
