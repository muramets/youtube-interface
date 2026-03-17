# Ambient Mode + Document Scroll Layout

> Приложение использует document scroll (как YouTube) с fixed header/sidebar. На Watch Page размытый thumbnail видео создаёт ambient glow, проникающий через header и sidebar.

## Текущее состояние

**Stage 1 (Layout) — DONE.** App-shell scroll → document scroll + fixed header/sidebar.
**Stage 2 (Ambient) — DONE.** Ambient `<img>` + semi-transparent header на Watch page.
**Stage 3 (Market-ready) — TODO.** Animated crossfade, user toggle, mobile adaptation.

← YOU ARE HERE: Stage 2 complete, Stage 3 is future work.

---

## Что это такое

**Аналогия:** Представьте кинотеатр с подсветкой Ambilight — телевизор, который проецирует цвета экрана на стену за ним. Цвета из видео естественно растекаются по шапке, сайдбару и фону, создавая immersive experience как у YouTube.

**Два уровня ценности:**

1. **Document scroll (layout)** — нативный скролл документа. Плавный мобильный скролл, Ctrl+F, scroll restoration, fixed header/sidebar без bounce при overscroll.

2. **Ambient mode (Watch Page)** — размытый thumbnail создаёт цветное свечение, проникающее в header и sidebar.

---

## User Flow

### Document Scroll
- Скролл на всех страницах — нативный document scroll
- Header и sidebar — `position: fixed`, не дёргаются при overscroll bounce
- Ctrl+F, Back navigation, scroll restoration — работают нативно

### Ambient Mode (Watch Page)
1. Пользователь открывает `/watch/:id`
2. Размытый thumbnail мягко подсвечивает area вокруг плеера
3. Свечение проникает в header (semi-transparent background + backdrop-blur)
4. При навигации к другому видео — ambient обновляется
5. На других страницах — header обычный `bg-bg-primary`

---

## Roadmap

### Stage 1 — Layout Refactoring ✅

- Root div: `min-h-screen overflow-x-hidden` (document scrolls, no horizontal overflow from ambient scale)
- Header: `position: fixed top-0` + spacer div `h-14`
- Sidebar: `position: fixed top-14` + placeholder div для ширины в flex layout
- Main: без `overflow-y-auto` (document handles scrolling)
- Full-viewport pages (Trends, Music): `h-[calc(100vh-56px)]`
- Scrollable pages (Home, Playlists, Knowledge, Watch): `min-h-[calc(100vh-56px)]`
- Sticky elements: `top-14` (below fixed header) или `top-0` (inside own scroll container)
- Document scrollbar: auto-hide (thin, appears on hover via CSS)

### Stage 2 — Ambient Mode ✅

- Ambient `<img>` в `WatchPageVideoPlayer.tsx`: `blur-[60px] scale-[2] opacity-15`
- Header на `/watch/` routes: `bg-bg-primary-ambient backdrop-blur-xl`
- `bg-bg-primary-ambient`: `color-mix(in srgb, var(--bg-primary) 92%, transparent)` — обходит ограничение Tailwind `/opacity` с hex CSS variables
- WatchPageFilterBar: `mask-image` fade (pills исчезают в прозрачность, не в цвет)

### Stage 3 — Market-ready (future)

- Animated ambient: плавный crossfade при переключении видео
- User preference: toggle для ambient в Settings
- Performance: `will-change: transform`, conditional rendering на слабых устройствах
- Mobile: адаптация blur radius и opacity для маленьких экранов
- `prefers-reduced-motion`: отключение ambient при системном флаге

---

## Technical Implementation

### Ключевые файлы

| Файл | Роль |
|------|------|
| `src/App.tsx` | Root layout, header spacer, Watch route detection → header className |
| `src/components/Layout/Header.tsx` | `position: fixed`, принимает `className` prop |
| `src/components/Layout/Sidebar.tsx` | `position: fixed` + placeholder div в flex layout + audio player padding (`pb-14` when active) |
| `src/features/Watch/components/WatchPageVideoPlayer.tsx` | Ambient `<img>` element |
| `src/features/Watch/components/WatchPageFilterBar.tsx` | `mask-image` fade для filter pills |
| `src/features/Watch/WatchPage.tsx` | `window.scrollTo(0, 0)` при навигации |
| `src/index.css` | `bg-bg-primary-ambient` utility, document scrollbar auto-hide |

### Layout Architecture (YouTube pattern)

```
<div min-h-screen overflow-x-hidden>          ← root, document scrolls
  <header fixed top-0 z-sticky>               ← fixed header, no bounce
  <div h-14>                                  ← spacer for fixed header
  <div flex flex-1 relative>
    <div w-[72px]>                             ← sidebar placeholder (in flow)
    <aside fixed top-14 left-0 z-sticky>      ← fixed sidebar, no bounce
    <main flex-1 flex-col relative>            ← no overflow, content flows
      <Routes>
```

### Ambient Architecture

```
WatchPageVideoPlayer
  <div relative mb-4>                         ← no overflow (visible default)
    <img absolute scale-[2] blur-[60px]       ← ambient, bleeds in all directions
         opacity-15 z-0 pointer-events-none>
    <div relative z-10 rounded-xl overflow-hidden> ← player (above ambient)
      iframe / custom image
```

Ambient source: `video.thumbnail || video.customImage` — YouTube CDN thumbnail для YT видео, Firebase Storage для custom видео.

### CSS Gotcha: Tailwind opacity modifier + hex CSS variables

Tailwind `/80` modifier не работает с hex CSS variables (`--bg-primary: #0f0f0f`). Генерирует невалидный `rgb(#0f0f0f / 0.8)`. Решение: `color-mix(in srgb, var(--bg-primary) 92%, transparent)` в утилитарном классе `bg-bg-primary-ambient`.
