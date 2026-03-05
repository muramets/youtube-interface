# Trends — Мониторинг конкурентов

## Текущее состояние

Полностью рабочая система мониторинга YouTube-каналов конкурентов. Пользователь добавляет каналы, система ежедневно синхронизирует все их видео через YouTube Data API и отслеживает динамику просмотров. Два режима визуализации: интерактивный таймлайн (scatter plot) и таблица с дельтами роста. Видео группируются по нишам (категориям), поддерживается drag-drop, фильтрация, экспорт CSV, и интеграция с AI-чатом для анализа конкурентов.

**← YOU ARE HERE** — фича стабильна, используется в production.

## Что это такое

**Аналогия:** Радар для YouTube-конкурентов. Ты добавляешь каналы, которые хочешь отслеживать — система каждый день фотографирует их статистику. Через день/неделю/месяц ты видишь, какие видео выросли и насколько.

## User Flow

1. **Добавление каналов** — пользователь вставляет ссылку на YouTube-канал (URL, @handle, или channel ID). Система резолвит ID, загружает метаданные и все видео канала.
2. **Автоматическая синхронизация** — каждый день в 00:00 UTC Cloud Scheduler запускает синк всех каналов. Также доступен ручной синк по кнопке.
3. **Визуализация** — два режима:
   - **Timeline** — scatter plot: ось X = дата публикации, ось Y = просмотры, размер точки = перцентиль (Top 1%, Top 5% и т.д.)
   - **Table** — табличный вид с колонками дельт роста (24h, 7d, 30d)
4. **Ниши** — пользователь создаёт категории (глобальные или локальные) и раскладывает видео по ним через drag-drop
5. **Фильтрация** — по дате, просмотрам, перцентилям, нишам. Фильтры персистятся per-channel/per-niche.
6. **Анализ** — выбранные видео отправляются в AI-чат как контекст для конкурентного анализа
7. **Экспорт** — выбранные видео экспортируются в CSV

## Архитектура (высокоуровневая)

```
┌─────────────────────────────────────────────────────────────────┐
│                        TrendsPage                               │
│  ┌──────────┐  ┌────────────────┐  ┌─────────────────────────┐  │
│  │  Header   │  │ Timeline/Table │  │     FloatingBar         │  │
│  │ (filters, │  │   (основное    │  │  (actions на выбранных) │  │
│  │  sync,    │  │   полотно)     │  │                         │  │
│  │  settings)│  │                │  │                         │  │
│  └──────────┘  └────────────────┘  └─────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
         │                │                      │
    ┌────▼────────────────▼──────────────────────▼──┐
    │              useTrendStore (Zustand)           │
    │  videos, channels, niches, filters, timeline  │
    └───────────────────────┬───────────────────────┘
                            │
    ┌───────────────────────▼───────────────────────┐
    │            TrendService (frontend)            │
    │  IndexedDB (cache) + Firestore (persistent)   │
    └───────────────────────┬───────────────────────┘
                            │
    ┌───────────────────────▼───────────────────────┐
    │         Cloud Functions (backend)             │
    │  scheduledTrendSnapshot + manualTrendSync     │
    │           ↓                                   │
    │  SyncService → YouTubeService → YouTube API   │
    └───────────────────────────────────────────────┘
```

## Связанная документация

- [Timeline](./timeline.md) — визуализация scatter plot (scaling, baseline, virtualization)
- [Niche System](./niche-system.md) — категоризация видео (global/local, split/merge, drag-drop)
- [Sync Pipeline](./sync-pipeline.md) — бэкенд синхронизации (YouTube API, quota, snapshots)
- [Table View](./table-view.md) — табличное представление и delta система

## Roadmap

### Stage 1: Core ✅
- [x] Добавление/удаление каналов
- [x] Синхронизация видео (scheduled + manual)
- [x] Timeline визуализация
- [x] Табличный вид с дельтами
- [x] Система ниш (global/local)
- [x] Фильтрация (date, views, percentile, niche)
- [x] CSV экспорт
- [x] AI chat integration (context bridge)

### Stage 2: Enhancements (planned)
- [ ] Hit detection (автоматическое определение вирусных видео)
- [ ] Snapshot retention policy (очистка старых снимков)
- [ ] Cross-channel trend analysis (общие тренды между каналами)

---

## Technical Implementation

### Ключевые файлы

| Область | Путь |
|---------|------|
| Types | `src/core/types/trends.ts` |
| Store | `src/core/stores/trends/trendStore.ts` |
| Service (frontend) | `src/core/services/trendService.ts` |
| Page | `src/pages/Trends/TrendsPage.tsx` |
| Header | `src/pages/Trends/Header/` |
| Sidebar | `src/pages/Trends/Sidebar/` |
| Timeline | `src/pages/Trends/Timeline/` |
| Table | `src/pages/Trends/Table/` |
| Page hooks | `src/pages/Trends/hooks/` |
| Cloud Functions | `functions/src/trends/` |
| SyncService | `functions/src/services/sync.ts` |
| YouTubeService | `functions/src/services/youtube.ts` |
| Backend types | `functions/src/types.ts` |
| Delta utility | `src/core/utils/computeVideoDeltas.ts` |
| Tests | `functions/src/trends/scheduledSync.test.ts` |

### Firestore Collections

```
users/{userId}/channels/{channelId}/
  settings/general              → { apiKey }
  settings/sync                 → { trendSync: { enabled } }
  trendChannels/{trendChannelId} → TrendChannel document
    videos/{videoId}            → TrendVideo document
    snapshots/{timestamp}       → TrendSnapshot { videoViews map }
  trendNiches/{nicheId}         → TrendNiche document
  videoNicheAssignments/{id}    → { videoId, nicheId }
  hiddenVideos/{videoId}        → { channelId, hiddenAt }
  notifications/{id}            → sync result notification
```

### Data Flow

```
Frontend:                                    Backend:
TrendService.subscribeToTrendChannels()  ←── SyncService writes videos + snapshots
  ↓ onSnapshot                               ↑
useTrendStore.setChannels()              Cloud Function (scheduled/manual)
  ↓                                          ↑
useTrendVideos (cache → Firestore)       YouTubeService (YouTube Data API)
  ↓
useFilteredVideos (filters)
  ↓
TimelineCanvas / TrendsTable
```

### State Management

`useTrendStore` (Zustand, persisted to localStorage):
- `videos`, `channels`, `niches` — core data
- `videoNicheAssignments` — video → niche mapping
- `hiddenVideos` — trash
- `timelineConfig` — viewport/scaling settings
- `trendsFilters` — active filter items
- `selectedChannelId` — null = All Channels, string = specific channel
- `channelRootFilters`, `nicheFilters` — per-context filter persistence
- `selectedVideo`, `hoveredVideo` — UI interaction state

### Frontend Storage Layers

- **IndexedDB** (`trends-db`) — local video cache с индексами `by-channel` и `by-published`
- **Firestore** — persistent data (channels, niches, assignments, hidden, snapshots)
- **localStorage** — Zustand store persistence (filters, timeline config)
