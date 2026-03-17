# Mini Player

> Плавающее окно с YouTube-видео, которое следует за пользователем при навигации по приложению. Как "картинка в картинке" на телефоне — видео продолжает играть, пока ты делаешь другие дела.

## Текущее состояние

**Stage 1 (Core) — DONE.** Плавающий iframe-плеер с drag, resize, persist позиции.
**Stage 2 (App-wide integration) — DONE.** Mini player интегрирован в 6 точек: Watch Page, Video Preview Tooltip, Traffic Table, Canvas (VideoCard + TrafficSource), Details Sidebar.
**Stage 3 (Market-ready) — TODO.** Maximize обратно на Watch Page, keyboard shortcuts, mobile swipe-to-dismiss, анимация перехода.

← YOU ARE HERE: Stage 2 complete, Stage 3 is future work.

---

## Что это такое

Пользователь видит видео в любом месте приложения — Watch Page, таблица трафика, Canvas, тултип — и может запустить его в мини-плеере одним кликом. Видео сворачивается в компактное плавающее окно в углу экрана. Можно переходить на другие страницы, а видео продолжает играть.

**Бизнес-ценность:** creator может анализировать статистику, редактировать packaging, просматривать тренды — всё не отрываясь от просмотра видео. Ключевой workflow для анализа конкурентов: смотришь видео и параллельно сравниваешь метрики.

---

## User Flow

### Запуск миниплеера (6 точек входа)

| Где | Как | Что видит пользователь |
|-----|-----|----------------------|
| **Watch Page** | Hover → кнопка "Mini Player" (bottom-right iframe) | iframe заменяется обложкой + лейбл "Playing in Mini Player" |
| **Video Preview Tooltip** | Кнопка "Minimize" в тултипе | Тултип показывает thumbnail вместо iframe |
| **Traffic Table** | Hover на thumbnail строки → кнопка Play | Зелёная анимация "now playing" на thumbnail |
| **Canvas: VideoCardNode** | Hover на ноду → кнопка Play | Animated bars по центру thumbnail |
| **Canvas: TrafficSourceNode** | Hover на thumbnail источника → кнопка Play | Animated bars по центру thumbnail |
| **Details Sidebar** | Клик на thumbnail видео | Animated bars по центру thumbnail |

### Управление миниплеером
- **Drag** за header (заголовок видео) — перетаскивание по экрану
- **Resize** за края и углы — изменение размера с сохранением 16:9
- **Close** (X) — закрытие миниплеера
- Позиция и размер **сохраняются** в localStorage между сессиями

### "Now Playing" визуал
Компоненты, которые запустили видео, показывают визуальный индикатор:
- **Watch Page** — обложка + лейбл "Playing in Mini Player"
- **Video Preview Tooltip** — thumbnail вместо iframe
- **Traffic Row** — emerald ring на thumbnail + animated bars
- **Canvas nodes** — animated bars по центру thumbnail

---

## Roadmap

### Stage 1 — Core Mini Player ✅
- [x] Floating iframe window с YouTube embed (autoplay)
- [x] Draggable header с заголовком видео и кнопкой закрытия
- [x] Resizable по всем 8 краям/углам, с lock 16:9 aspect ratio
- [x] rAF-throttled drag/resize (GPU-accelerated transform во время drag)
- [x] localStorage persistence позиции и размера
- [x] Re-clamp при resize окна браузера
- [x] `pointer-events-none` на iframe во время взаимодействия (drag/resize)
- [x] Global mount в App.tsx (рендерится на всех страницах)

### Stage 2 — App-Wide Integration ✅
- [x] Watch Page: thumbnail placeholder + "Playing in Mini Player" лейбл
- [x] Video Preview Tooltip: minimize button + thumbnail fallback
- [x] Traffic Table: play overlay на thumbnail + "now playing" animated bars
- [x] Canvas VideoCardNode: play overlay + animated bars
- [x] Canvas TrafficSourceNode: play overlay + animated bars
- [x] Details Sidebar: thumbnail click → minimize + "now playing" badge

### Stage 3 — Market-Ready (TODO)
- [ ] Maximize: клик на миниплеер → навигация к source (откуда был запущен). Доступно не из всех точек — только если source имеет navigable route (Watch Page, Details/Traffic). Canvas nodes и tooltips не имеют прямого URL.
- [ ] Keyboard shortcuts (Escape = close, M = minimize/maximize)
- [ ] Анимация перехода (morph animation из source в mini-position)
- [ ] Mobile: swipe-to-dismiss, touch drag
- [ ] Persist playback position (передавать timestamp между embed'ами)
- [ ] Multiple video queue (playlist-like mini player)

---

## Technical Implementation

### Архитектура

```
VideoPlayerContext (React Context, App.tsx root)
├── state: { activeVideoId, isMinimized, videoTitle }
├── actions: minimize(), close(), maximize()
│
├── GlobalMiniPlayer (App.tsx, рендерится всегда)
│   ├── useMiniPlayerGeometry() — drag/resize/persist
│   └── YouTube iframe embed (?autoplay=1)
│
└── Consumers (вызывают minimize / читают state):
    ├── WatchPageVideoPlayer — iframe OR placeholder
    ├── VideoPreviewTooltip — iframe OR thumbnail + "Minimize" button
    ├── TrafficRow — play overlay + "now playing" ring + animated bars
    ├── VideoCardNode (Canvas) — play overlay + animated bars
    ├── TrafficSourceNode (Canvas) — play overlay + animated bars
    └── SidebarVideoPreview — thumbnail click + animated bars
```

### Точки интеграции

| Компонент | Файл | Calls `minimize` | Reads state | "Now playing" визуал |
|-----------|------|:-:|:-:|:-:|
| **WatchPageVideoPlayer** | `src/features/Watch/components/WatchPageVideoPlayer.tsx` | ✓ | ✓ | Thumbnail + лейбл |
| **VideoPreviewTooltip** | `src/features/Video/components/VideoPreviewTooltip.tsx` | ✓ | ✓ | Thumbnail вместо iframe |
| **TrafficRow** | `src/pages/Details/tabs/Traffic/components/TrafficRow.tsx` | ✓ | ✓ | Ring + animated bars |
| **VideoCardNode** | `src/features/Canvas/nodes/VideoCardNode.tsx` | ✓ | ✓ | Animated bars |
| **TrafficSourceNode** | `src/features/Canvas/nodes/TrafficSourceNode.tsx` | ✓ | ✓ | Animated bars |
| **SidebarVideoPreview** | `src/pages/Details/Sidebar/SidebarVideoPreview.tsx` | ✓ | ✓ | Animated bars |

### Video ID Gotcha

Разные компоненты передают в `minimize()` разные ID — зависит от источника данных:

| Компонент | Какой ID передаёт в minimize() | Почему |
|-----------|-------------------------------|--------|
| WatchPageVideoPlayer | `video.id` | YouTube ID напрямую |
| VideoPreviewTooltip | `embedId` (resolved) | `publishedVideoId` для custom, `videoId` для обычных |
| TrafficRow | `item.videoId` | YouTube ID из traffic data |
| VideoCardNode | `publishedVideoId` | Custom видео хранят YouTube ID отдельно |
| TrafficSourceNode | `data.videoId` | YouTube ID из traffic source |
| SidebarVideoPreview | `publishedVideoId` или `video.id` | Resolved YouTube ID |

**Правило:** `activeVideoId` в контексте — это всегда **YouTube Video ID** (тот, что в iframe embed URL). При сравнении `activeVideoId === X` нужно использовать тот же resolved ID.

### Файлы инфраструктуры

| Файл | Назначение |
|------|-----------|
| `src/core/contexts/VideoPlayerContext.tsx` | React Context: state + actions (minimize, close, maximize) |
| `src/core/hooks/useVideoPlayer.ts` | Hook-обёртка для context |
| `src/features/Player/GlobalMiniPlayer.tsx` | Floating mini player component (iframe + header + resize handles) |
| `src/features/Player/hooks/useMiniPlayerGeometry.ts` | Drag, resize, persist, clamp logic (330 LOC) |
| `src/features/Player/MiniPlayer.css` | CSS для resize edge handles |

### Ключевые константы (`useMiniPlayerGeometry`)

| Константа | Значение | Назначение |
|-----------|----------|-----------|
| `ASPECT_RATIO` | 9/16 | Lock соотношение сторон |
| `MIN_W` / `MAX_W` | 240 / 720 | Границы ширины |
| `HEADER_H` | 32px | Высота header миниплеера |
| `MIN_MARGIN` | 16px | Минимальный отступ от краёв viewport |
| `APP_HEADER_H` | 56px | Высота шапки приложения (не заезжать под неё) |
| `DEFAULT_W` | 320px | Ширина по умолчанию |
| `STORAGE_KEY` | `mini-player-geometry` | localStorage key для persist |

### iframe Embed параметры

| Место | URL параметры | Autoplay |
|-------|-------------|----------|
| GlobalMiniPlayer | `?autoplay=1&modestbranding=1&rel=0` | Да |
| WatchPageVideoPlayer | Без параметров | Нет |
| VideoPreviewTooltip | `?autoplay=0&mute=0&rel=0&modestbranding=1&controls=1` | Нет |

### Связанные фичи
- [Ambient Mode](../watch/ambient-mode.md) — Watch Page layout, ambient glow от обложки видео
