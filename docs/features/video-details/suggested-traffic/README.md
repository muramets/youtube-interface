# Suggested Traffic — Feature Doc

## Текущее состояние

**Stages 1-6 реализованы.** Таб Suggested Traffic внутри Video Details page. CSV upload, smart parsing, YouTube API enrichment, snapshot versioning с delta mode, Smart Assistant (traffic type, viewer type, niche suggestions), Chat Bridge + Canvas Bridge, per-snapshot notes и reactions. AI-анализ on-demand через tool `analyzeSuggestedTraffic` — строит per-video timelines, находит transitions (new/dropped), анализирует контент (shared tags, keywords, channels), определяет self-channel видео.

---

## Что это

Показывает, **рядом с какими видео YouTube рекомендует твоё видео** (suggested / autoplay). Пользователь скачивает CSV из YouTube Analytics → загружает в приложение → видео обогащаются через YouTube API → отображаются в таблице с классификацией.

**Ключевой вопрос, на который отвечает:** *"Мое видео показывается рядом с Lofi Girl (500 impressions, CTR 4.2%) и рядом с ChilledCow (200 impressions, CTR 1.1%) — значит YouTube считает меня частью Lofi ниши, и Lofi Girl приносит самый качественный трафик."*

### Отличие от Traffic Sources

| | **Suggested Traffic** | **Traffic Sources** |
|---|---|---|
| **Вопрос** | Рядом с какими видео YouTube рекомендует моё? | Откуда приходит трафик? |
| **Данные** | Конкретные видео (с video ID) | Агрегированные метрики по источникам |
| **Строк** | 50-500 (каждое видео отдельно) | ~6-8 (Suggested, Browse, Search...) |
| **Основная ценность** | Анализ конкурентного окружения | Динамика метрик во времени |
| **AI-тул** | `analyzeSuggestedTraffic` (drill-down) | `analyzeTrafficSources` (gateway) |
| **Связь** | Вызывается ПОСЛЕ — когда gateway показал, что Suggested доминирует | Вызывается ПЕРВЫМ — показывает общую картину |

### CSV формат
```
Traffic source,Views,Watch time (hours),Average view duration,Impressions,Impressions click-through rate (%)
Total,1200,230.5,0:11:32,28000,4.28
YT_RELATED.dQw4w9WgXcQ,Rick Astley - Never Gonna Give You Up,450,85.2,0:11:21,12000,3.75
YT_RELATED.kJQP7kiw5Fk,Luis Fonsi - Despacito,280,52.1,0:11:09,8500,3.29
...
```

---

## Enrichment: какие данные откуда

| Поле | Источник CSV | YouTube API enrichment | Smart Assistant |
|------|:-----------:|:---------------------:|:---------------:|
| videoId | ✅ (из `YT_RELATED.xxx`) | — | — |
| sourceTitle | ✅ (может быть пустым) | ✅ `title` | — |
| impressions, ctr, views, avgViewDuration, watchTimeHours | ✅ | — | — |
| thumbnail | — | ✅ | — |
| channelTitle, channelId | — | ✅ | — |
| publishedAt, duration | — | ✅ | — |
| description, tags | — | ✅ | — |
| viewCount, likeCount | — | ✅ | — |
| subscriberCount | — | ✅ (`channels.list` batch) | — |
| trafficType (autoplay/click) | — | — | ✅ |
| viewerType (bouncer→core) | — | — | ✅ |
| niche, nicheProperty | — | — | ✅ (+ manual) |

> Enrichment делает 2 API-вызова на batch (до 50 видео): `videos.list` (title, description, tags, viewCount, duration) + `channels.list` (subscriberCount, channelAvatar). Квота: 2 units на batch. Результат кэшируется в `cached_external_videos` — shared коллекция, доступная всем фичам.
>
> Подробнее о процессе обогащения и блокировке Smart Assistant: [Data Repair & Smart Assistant Gate](./data-repair.md)

---

## Что улетает в Chat Bridge

При выделении строк → `setSlot('traffic', context)`:

**`SuggestedTrafficContext`:**
```
{
  type: 'suggested-traffic',
  snapshotId, snapshotDate, snapshotLabel,
  sourceVideo: {                          <- ТВОЁ видео
    videoId, title, description, tags,
    thumbnailUrl, viewCount, publishedAt, duration
  },
  suggestedVideos: [                      <- ВЫБРАННЫЕ строки
    {
      videoId, title,
      // CSV metrics (всегда):
      impressions, ctr, views, avgViewDuration, watchTimeHours,
      // YouTube API (если enriched):
      thumbnailUrl, channelTitle, publishedAt, duration,
      description, tags, viewCount, likeCount, subscriberCount,
      // Smart Assistant labels:
      trafficType, viewerType, niche, nicheProperty
    }
  ],
  discrepancy?: { reportTotal, tableSum, longTail }  <- Long Tail
}
```

Bridge встроен inline в TrafficTab.tsx. Контекст попадает в system prompt через `persistentContextLayer.ts`.

> Chat Bridge передает ПОЛНЫЕ данные (CSV + enrichment + labels). Это одна из причин раздутого system prompt при выделении большого количества строк. Альтернатива для AI-анализа — tool `analyzeSuggestedTraffic`, который не раздувает контекст.

---

## Что улетает в Canvas

При "Add to Canvas" → `addNodeToPage(dataArr)`:

**`TrafficSourceCardData` (per node):**
```
{
  type: 'traffic-source',
  videoId, title, thumbnailUrl,
  channelTitle, channelId, publishedAt,
  // CSV metrics:
  impressions, ctr, ctrColor, views, avgViewDuration, watchTimeHours,
  // Labels:
  trafficType, viewerType, niche, nicheColor,
  // Context:
  sourceVideoId, sourceVideoTitle,
  snapshotId, snapshotLabel, viewMode,
  // Enrichment (для canvas → chat bridge, не рендерится на canvas):
  description, tags, viewCount, duration
}
```

Canvas ноды содержат enrichment data (description, tags) — они не рендерятся визуально, но используются когда Canvas Bridge передаёт selection в чат.

---

## Roadmap

### Stage 1 — CSV Import + Table ✅
- [x] Smart CSV parser с auto-detection колонок
- [x] Column Mapper fallback (manual mapping)
- [x] TrafficTable с сортировкой, фильтрами
- [x] Total Row detection + Long Tail discrepancy

### Stage 2 — Snapshots + Versioning ✅
- [x] Hybrid storage: CSV → Cloud Storage, metadata → Firestore
- [x] Snapshot timeline привязана к packaging versions
- [x] Delta mode (прирост между снапшотами)
- [x] Packaging snapshot preservation (если version удалена)

### Stage 3 — Enrichment ✅ → [Data Repair doc](./data-repair.md)
- [x] Pre-upload: patch titles из кэша (`cached_external_videos`)
- [x] Missing Titles modal + `repairTrafficSources` (YouTube API)
- [x] CSV regeneration после repair
- [x] Enrichment cache (React Query, per-channel)

### Stage 4 — Smart Assistant ✅
- [x] Auto-detect autoplay (0 impressions + >0 views)
- [x] Viewer Type auto-classify (bouncer→core по AVD и watch time)
- [x] Niche suggestions (Harmonic Decay Scoring по тегам)
- [x] Cross-tab suggestions (Trends → Traffic niches)

### Stage 5 — Bridges + Edge Data ✅
- [x] Chat Bridge: SuggestedTrafficContext + full enrichment
- [x] Canvas Bridge: TrafficSourceCardData + frame grouping
- [x] Reactions (star/like/dislike) — per-channel
- [x] Notes — per-video (inline в таблице)

### Stage 6 — AI Tool (on-demand analysis) ✅
AI-ассистент анализирует suggested traffic через dedicated tool — полный анализ без раздувания контекста.
- [x] Server-side tool `analyzeSuggestedTraffic` — Firestore → Cloud Storage → parse → timelines → JSON
- [x] Server-side CSV parser (RFC 4180, `YT_RELATED.{id}` extraction)
- [x] Per-video timeline builder с pre-computed deltas
- [x] Transitions: new/dropped видео между snapshot'ами
- [x] Content analysis: shared tags, keywords, channel distribution
- [x] Self-channel detection (видео с собственного канала)
- [x] Content trajectory (per-snapshot keywords evolution)
- [x] Depth enum: quick (top 20) / standard (top 50) / detailed (top 100) / deep (all)
- [x] Enrichment из `cached_external_videos` (Firestore) — tags, description, channelTitle
- [x] View delta enrichment: suggested видео обогащаются `viewDelta24h/7d/30d` из trend snapshots (через `trendSnapshotService`). `analysisGuidance` объясняет LLM семантику view deltas (положительные = рост, null = нет данных). Подробнее: [Video View Deltas](../../video-view-deltas.md)

### Stage 7 — Lightweight Context ← YOU ARE HERE
Bridge передаёт только IDs вместо полных данных. AI запрашивает details on-demand.
- [ ] Chat Bridge передаёт `{ videoId, title, impressions, views }` вместо full data
- [ ] AI вызывает `getVideoDetails(id)` для description, tags, thumbnail
- [ ] 500 traffic sources → 500 IDs (~3K токенов) вместо 500 full descriptions (~140K)

### Production
**User flow:** Пользователь публикует видео. Через неделю загружает CSV. Видео обогащаются через YouTube API. Smart Assistant классифицирует: autoplay/click, bouncer/core, ниша. Через 2 недели — второй CSV. Delta mode показывает: какие видео выросли, какие упали, какие новые. AI анализирует on-demand: *"70% трафика от Lofi каналов, CTR 4.2% — YouTube прочно определил тебя в Lofi нишу. Но 3 новых Jazz видео появились с высоким CTR — возможно, аудитория расширяется."*

- [ ] **Архитектура:** Lightweight bridge + AI tool для deep analysis
- [ ] **Стоимость:** Bridge: ~$0.01 (IDs only) вместо ~$2.80 (full data). Tool: per-request
- [x] **Хранение:** CSV в Cloud Storage + Firestore metadata + `cached_external_videos` (enrichment)
- [x] **API:** YouTube Data API (enrichment при добавлении), AI tools (on-demand analysis)

---

## Связанные фичи
- [Traffic Sources](../traffic-sources.md) — агрегированные метрики по источникам. `analyzeTrafficSources` = gateway, `analyzeSuggestedTraffic` = drill-down
- [Data Repair & Smart Assistant Gate](./data-repair.md) — enrichment flow, gatekeeper pattern, cache-first архитектура
- [Telescope Pattern Overview](../../chat/tools/README.md) — `analyzeSuggestedTraffic` входит в Telescope Pattern (Layer 3 — drill-down tool)
- [analyzeSuggestedTraffic Tool Doc](../../chat/tools/layer-3-analysis/analyze-suggested-traffic-tool.md) — подробная документация AI-тула (параметры, output, stages)
- Chat — Chat Bridge передаёт `SuggestedTrafficContext` через `appContextStore`; `SuggestedTrafficChip` в chat UI
- Canvas — Traffic nodes с frame grouping по snapshot'ам
- Video Details — Suggested Traffic живёт как таб `traffic` внутри Details page

---

## Technical Implementation

### Frontend — Tab & Table
| Файл | Назначение |
|------|-----------|
| `pages/Details/tabs/Traffic/TrafficTab.tsx` | Главный orchestrator: CSV upload, table, bridges (chat + canvas) |
| `pages/Details/tabs/Traffic/components/TrafficTable.tsx` | Virtualized table: сортировка, фильтры, selection |
| `pages/Details/tabs/Traffic/components/TrafficRow.tsx` | Строка: title, metrics, badges (traffic type, viewer type, niche, reaction) |
| `pages/Details/tabs/Traffic/components/TrafficRowBadges.tsx` | Compact badge rendering |
| `pages/Details/tabs/Traffic/components/TrafficHeader.tsx` | Header с view mode toggle (cumulative/delta) |
| `pages/Details/tabs/Traffic/components/TrafficFloatingBar.tsx` | Floating action bar для bulk operations |
| `pages/Details/tabs/Traffic/components/TrafficFilterMenu.tsx` | Filter configuration UI |
| `pages/Details/tabs/Traffic/components/TrafficFilterChips.tsx` | Active filter chips |
| `pages/Details/tabs/Traffic/components/TrafficUploader.tsx` | CSV upload UI |
| `pages/Details/tabs/Traffic/components/TrafficEmptyState.tsx` | Empty state |
| `pages/Details/tabs/Traffic/components/TrafficErrorState.tsx` | Error display + retry |
| `pages/Details/tabs/Traffic/components/TrafficModals.tsx` | Modal orchestrator |
| `pages/Details/tabs/Traffic/components/TrafficCTRConfig.tsx` | CTR color rules config |
| `pages/Details/tabs/Traffic/components/TrafficPlaylistSelector.tsx` | Playlist assignment |
| `pages/Details/tabs/Traffic/components/SmartTrafficTooltip.tsx` | Smart suggestion tooltip |
| `pages/Details/tabs/Traffic/components/VersionPills.tsx` | Version/period pills |

### Frontend — Niches
| Файл | Назначение |
|------|-----------|
| `pages/Details/tabs/Traffic/components/Niches/TrafficNicheSelector.tsx` | Niche picker |
| `pages/Details/tabs/Traffic/components/Niches/TrafficNicheItem.tsx` | Niche group display |
| `pages/Details/tabs/Traffic/components/Niches/TrafficNicheContextMenu.tsx` | Right-click menu для niche assignment |
| `pages/Details/tabs/Traffic/components/Niches/NicheColorPickerGrid.tsx` | Color picker для niches |
| `pages/Details/tabs/Traffic/components/Niches/TrafficSidebarNicheList.tsx` | Niche list в sidebar |

### Frontend — Modals
| Файл | Назначение |
|------|-----------|
| `pages/Details/tabs/Traffic/modals/ColumnMapperModal.tsx` | Fallback column mapping |
| `pages/Details/tabs/Traffic/modals/DataRepairModal.tsx` | Missing titles repair via YouTube API |
| `pages/Details/tabs/Traffic/modals/SnapshotRequestModal.tsx` | Snapshot request UI |
| `pages/Details/tabs/Traffic/modals/VersionFreezeModal.tsx` | Version freeze confirmation |

### Frontend — Sidebar
| Файл | Назначение |
|------|-----------|
| `pages/Details/Sidebar/Traffic/TrafficNav.tsx` | Sidebar snapshot list |
| `pages/Details/Sidebar/Traffic/components/SidebarSnapshotItem.tsx` | Single snapshot item |
| `pages/Details/Sidebar/Traffic/components/PackagingSnapshotTooltip.tsx` | Version tooltip |
| `pages/Details/Sidebar/Traffic/components/TrafficSidebarNicheList.tsx` | Niche list в sidebar |
| `pages/Details/Sidebar/Traffic/hooks/useTrafficVersions.ts` | Version resolution |
| `pages/Details/Sidebar/Traffic/SnapshotContextMenu.tsx` | Right-click on snapshot |

### Frontend — Hooks
| Файл | Назначение |
|------|-----------|
| `pages/Details/tabs/Traffic/hooks/useTrafficData.ts` | Firestore fetch, save, upload |
| `pages/Details/tabs/Traffic/hooks/useTrafficDataLoader.ts` | Snapshot load + delta calc |
| `pages/Details/tabs/Traffic/hooks/useExternalVideoLookup.ts` | YouTube API enrichment (React Query cache) |
| `pages/Details/tabs/Traffic/hooks/useMissingTitles.ts` | Pre-upload title patch + API repair |
| `pages/Details/tabs/Traffic/hooks/useSmartTrafficAutoApply.ts` | Auto-classify traffic type |
| `pages/Details/tabs/Traffic/hooks/useSmartViewerTypeAutoApply.ts` | Auto-classify viewer type |
| `pages/Details/tabs/Traffic/hooks/useSmartNicheSuggestions.ts` | Niche suggestions (Harmonic Decay Scoring) |
| `pages/Details/tabs/Traffic/hooks/useTrafficFilters.ts` | Filter state management |
| `pages/Details/tabs/Traffic/hooks/useTrafficSelection.ts` | Row selection state |
| `pages/Details/tabs/Traffic/hooks/useCTRRules.ts` | CTR coloring rules |

### Frontend — Utils
| Файл | Назначение |
|------|-----------|
| `pages/Details/tabs/Traffic/utils/csvParser.ts` | Client-side CSV parser (auto-detect EN + RU headers) |
| `pages/Details/tabs/Traffic/utils/csvGenerator.ts` | CSV generation (re-export after enrichment) |
| `pages/Details/tabs/Traffic/utils/exportTrafficCsv.ts` | Export с discrepancy report |
| `pages/Details/tabs/Traffic/utils/snapshotLoader.ts` | Cloud Storage download + parse |
| `pages/Details/tabs/Traffic/utils/snapshotCache.ts` | In-memory LRU cache |
| `pages/Details/tabs/Traffic/utils/formatters.ts` | Duration, number formatting |
| `pages/Details/tabs/Traffic/utils/publishDateFormatter.ts` | Date delta ("2 days ago") |
| `pages/Details/tabs/Traffic/utils/dateUtils.ts` | Date utilities |
| `pages/Details/tabs/Traffic/utils/constants.ts` | Constants |

### Frontend — Services
| Файл | Назначение |
|------|-----------|
| `core/services/traffic/TrafficDataService.ts` | Firestore CRUD for traffic data |
| `core/services/traffic/TrafficSnapshotService.ts` | Snapshot creation → Cloud Storage + Firestore |
| `core/services/traffic/TrafficDeltaService.ts` | Delta computation (current vs previous) |
| `core/services/suggestedTraffic/TrafficNicheService.ts` | Niche/group CRUD |
| `core/services/suggestedTraffic/TrafficNoteService.ts` | Per-video notes |
| `core/services/suggestedTraffic/TrafficTypeService.ts` | Traffic type assignments (autoplay/click) |
| `core/services/suggestedTraffic/ViewerTypeService.ts` | Viewer type assignments (bouncer→core) |
| `core/services/suggestedTraffic/VideoReactionService.ts` | Reactions (star/like/dislike) |

### Frontend — Types & Stores
| Файл | Назначение |
|------|-----------|
| `core/types/suggestedTraffic/traffic.ts` | `TrafficSource`, `EnrichedTrafficSource`, `TrafficSnapshot`, `TrafficData` |
| `core/types/appContext.ts` | `SuggestedTrafficContext`, `SuggestedVideoItem`, `TrafficSourceCardData` |
| `core/types/suggestedTraffic/suggestedTrafficNiches.ts` | Niche taxonomy |
| `core/types/suggestedTraffic/videoTrafficType.ts` | `TrafficType` enum |
| `core/types/suggestedTraffic/viewerType.ts` | `ViewerType` enum |
| `core/stores/appContextStore.ts` | `setSlot('traffic', context)` — Chat Bridge |
| `core/stores/suggestedTraffic/useTrafficNicheStore.ts` | Niche assignments |
| `core/stores/suggestedTraffic/useTrafficTypeStore.ts` | Traffic type labels |
| `core/stores/suggestedTraffic/useTrafficNoteStore.ts` | Per-video notes |
| `core/stores/suggestedTraffic/trafficFilterStore.ts` | Traffic filter state |

### Frontend — Chat & Canvas integration
| Файл | Назначение |
|------|-----------|
| `features/Chat/SuggestedTrafficChip.tsx` | Chat input chip (count + thumbnails) |
| `features/Canvas/nodes/TrafficSourceNode.tsx` | Canvas node (horizontal card layout) |
| `features/Canvas/hooks/useCanvasContextBridge.ts` | Canvas → Chat bridge |
| `features/Canvas/frames/SnapshotFrame.tsx` | Frame grouping по snapshot |
| `core/ai/layers/persistentContextLayer.ts` | System prompt formatter (Bridge → LLM context) |

### Backend (Cloud Functions)
| Файл | Назначение |
|------|-----------|
| `functions/src/services/tools/handlers/analyzeSuggestedTraffic.ts` | Tool handler: Firestore → Cloud Storage → parse → timelines → content analysis → JSON |
| `functions/src/services/tools/utils/csvParser.ts` | Server-side CSV parser (RFC 4180, `YT_RELATED.{id}` extraction) |
| `functions/src/services/tools/utils/delta.ts` | Per-video timeline builder + transitions (new/dropped) |
| `functions/src/services/tools/utils/suggestedAnalysis.ts` | Content analysis: shared tags, keywords, channels, self-channel, trajectory |
| `functions/src/services/trendSnapshotService.ts` | Server-side trend snapshot loader for view delta enrichment |
| `functions/src/services/tools/definitions.ts` | Tool declaration (provider-agnostic) |
| `functions/src/services/tools/executor.ts` | Tool routing |

### Data paths
```
Firestore:  users/{uid}/channels/{channelId}/videos/{videoId}/traffic/main
            users/{uid}/channels/{channelId}/cached_external_videos/{videoId}
Storage:    users/{uid}/channels/{channelId}/traffic/{videoId}/{snapshotId}.csv
URL param:  ?tab=traffic
Tab union:  'packaging' | 'trafficSource' | 'traffic' | 'gallery' | 'editing'
```

### Data flow
```
Upload:
  User drags CSV → csvParser.ts (auto-detect headers)
    → useMissingTitles (patch from cached_external_videos)
    → DataRepairModal (YouTube API batch if still missing)
    → csvGenerator.ts (regenerate CSV with patched titles)
    → Cloud Storage upload + Firestore snapshot metadata

View:
  User clicks snapshot → snapshotLoader.ts (download + parse + cache)
    → useTrafficDataLoader (delta calc vs previous snapshot)
    → Smart hooks auto-apply labels (traffic type, viewer type, niches)
    → TrafficTable renders with enrichment from useExternalVideoLookup

AI Analysis (on-demand):
  User asks AI → LLM calls analyzeSuggestedTraffic(videoId, depth)
    → Handler reads traffic/main + downloads all CSVs
    → csvParser.ts parses → delta.ts builds per-video timelines
    → suggestedAnalysis.ts: content analysis, self-channel, trajectory
    → Enrichment from cached_external_videos (tags, description)
    → View delta enrichment via trendSnapshotService (viewDelta24h/7d/30d)
    → Returns structured JSON + analysisGuidance → LLM interprets
    → LLM calls mentionVideo + viewThumbnails proactively
```

### Tests
| Файл | Кейсов |
|------|--------|
| `functions/src/services/tools/utils/__tests__/csvParser.test.ts` | 12 (RFC 4180, Total Row, edge cases) |
| `functions/src/services/tools/utils/__tests__/delta.test.ts` | 17 (timelines, transitions, new/dropped) |
| `functions/src/services/tools/utils/__tests__/suggestedAnalysis.test.ts` | 46 (content analysis, self-channel, trajectory, tokenizer) |
