# Trends — Timeline Visualization

> Интерактивный scatter plot для визуализации видео конкурентов во времени.

## Что это такое

**Аналогия:** Карта звёздного неба, где каждая звезда — видео конкурента. Позиция по горизонтали — когда видео вышло. Позиция по вертикали — сколько просмотров. Размер звезды — насколько это видео выделяется (перцентиль). Яркие крупные точки вверху — вирусные хиты. Мелкие тусклые внизу — обычные видео.

## Возможности

### Viewport Control
- **Pan** — перетаскивание мышью по canvas
- **Zoom** — колёсико мыши
- **Fit-to-content** — автоматическая подгонка viewport под все видимые видео
- **Auto-fit** — при изменении фильтров viewport автоматически перестраивается

### Scaling Modes (ось Y)
Четыре алгоритма для отображения просмотров:

| Режим | Поведение | Когда использовать |
|-------|-----------|-------------------|
| `linear` | Прямая пропорция | Каналы с ровным распределением |
| `log` | Логарифмическое сжатие | Каналы с вирусными хитами (по умолчанию) |
| `sqrt` | Квадратный корень | Баланс между linear и log |
| `percentile` | Группировка по перцентилям | Фокус на относительную позицию |

### Vertical Spread
Слайдер 0.0–1.0, контролирует "разброс" точек по вертикали. При 1.0 (Fit) — точки занимают всю высоту. При 0.0 — сжимаются к центру.

### Time Linearity
Слайдер 0.0–1.0:
- **0.0 (Linear)** — позиция по X пропорциональна реальной дате (если между видео прошёл год — будет большой пробел)
- **1.0 (Compact)** — позиция по X пропорциональна порядковому номеру (равномерное распределение)

### Average Baseline
Горизонтальная линия среднего:
- **Global** — одна фиксированная линия (среднее по всем видео)
- **Dynamic** — скользящее среднее с Gaussian-weighted окном (по умолчанию 30 дней, настраиваемо)

### Percentile Groups (размер и цвет точки)

| Группа | Цвет | Размер |
|--------|------|--------|
| Top 1% | emerald-500 | 96px |
| Top 5% | lime-500 | 80px |
| Top 20% | blue-500 | 64px |
| Middle 60% | purple-400 | 48px |
| Bottom 20% | red-400 | 40px |

### Selection & Interaction
- **Click** — выделить видео (additive с Cmd/Ctrl)
- **Drag to niche** — перетащить видео в нишу в sidebar
- **Hover** — tooltip с превью видео
- **Keyboard hotkeys** — навигация стрелками, цифры для переключения масштаба

### FloatingBar
Плавающая панель действий над выбранными видео:
- Assign to niche
- Remove from niche
- Hide (move to trash)
- Export CSV

## LOD (Level of Detail)

Для производительности с большими датасетами (1000+ видео):
- При низком zoom — показывает только точки (dots layer)
- При среднем zoom — точки + thumbnails
- При высоком zoom — полные карточки с заголовками

---

## Technical Implementation

### Ключевые компоненты

| Компонент | Назначение |
|-----------|-----------|
| `TimelineCanvas` | Главный оркестратор (refs, rendering, interaction) |
| `TimelineVideoLayer` | Рендер video nodes со smart LOD |
| `TimelineDotsLayer` | Compact dot visualization |
| `TimelineAverageLine` | Baseline (global / dynamic) |
| `TimelineBackground` | Сетка и month markers |
| `TimelineDateHeader` | Метки месяцев/годов |
| `TimelineViewAxis` | Y-axis labels |
| `TimelineControls` | UI-контролы настроек |
| `TimelineSelectionOverlay` | Feedback выделения |
| `TimelineTooltip` | Hover preview |
| `TrendsFloatingBar` | Sticky action bar |

### Ключевые хуки

| Хук | Назначение |
|-----|-----------|
| `useTimelineStructure` | Строит layout из videos (months, positions) |
| `useTimelinePositions` | Вычисляет X/Y координаты |
| `useTimelineTransform` | Управляет viewport (pan/zoom/fit) |
| `useTimelineInteraction` | Click, hover, keyboard |
| `useTimelineAutoUpdate` | Auto-fit при изменении данных/фильтров |
| `useTimelineVirtualization` | LOD rendering |
| `useTimelineHotkeys` | Keyboard shortcuts |
| `useTrendBaseline` | Расчёт average baseline |
| `useSelectionState` | Lifted selection management |
| `useFrozenStats` | Стабилизация stats при фильтрации |

### Утилиты

| Файл | Назначение |
|------|-----------|
| `trendLayoutUtils.ts` | `getTrendXPosition`, `getTrendYPosition` |
| `timelineConstants.ts` | LOD thresholds, padding |
| `timelineMath.ts` | Scaling algorithms (linear, log, sqrt, percentile) |
| `trendStyles.ts` | DOT_STYLES (percentile → color/size mapping) |

### Паттерн Frozen Stats

`useFrozenStats` разделяет два типа статистики:
- **Real-time stats** — пересчитываются при каждом изменении данных (для initial fit)
- **Frozen stats** — кэшируются после первого fit (для стабильности viewport при фильтрации)

Без этого паттерна каждое изменение фильтра вызывало бы прыжки viewport.
