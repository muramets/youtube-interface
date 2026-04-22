# Trends — Sync Pipeline

> Бэкенд-система синхронизации данных конкурентов с YouTube.

## Что это такое

**Аналогия:** Фотоаппарат, который каждый день делает снимок статистики конкурентов. Каждый "снимок" (snapshot) запоминает, сколько просмотров было у каждого видео в тот момент. Сравнивая снимки за разные дни, мы видим рост.

## Как работает синхронизация

### Три триггера — все идут через один Cloud Function

1. **Автоматический (daily)** — Cloud Scheduler запускает `scheduledTrendSnapshot` каждый день в 00:00 UTC. Проходит по ВСЕМ пользователям и ВСЕМ их каналам.
2. **Ручной (кнопка Sync в header)** — вызывается `manualTrendSync`. Синкает все видимые каналы текущего пользователя.
3. **Add Channel (модалка в sidebar) + per-channel refresh (меню «⋮»)** — после создания документа канала фронтенд делает fire-and-forget вызов `manualTrendSync` с `targetTrendChannelIds: [channelId]`. Это единственный путь синхронизации видео — клиентский YouTube-API-fetch удалён. Поэтому у нового канала сразу же появляется snapshot, нужный для view deltas и percentile distribution.

### Pipeline (шаг за шагом)

```
1. Проверка настроек
   └── settings/general → есть ли apiKey?
   └── settings/sync    → включён ли trendSync?
   (Если нет — канал пропускается)

2. Получение списка видео
   └── YouTubeService.getPlaylistVideos(uploadsPlaylistId)
   └── Пагинация: 50 ID за запрос, автопродолжение по nextPageToken

3. Получение метаданных
   └── YouTubeService.getVideoDetails(videoIds)
   └── Батчи по 50 ID (максимум YouTube API)
   └── Fetches: snippet (title, thumbnail, published, tags) + statistics (views, likes, comments)

4. Запись в Firestore (batch)
   └── trendChannels/{id}/videos/{videoId} — метаданные (merge: true)
   └── Батчи по 400 операций (safe margin < 500 limit)

5. Создание Snapshot
   └── trendChannels/{id}/snapshots/{timestamp}
   └── { timestamp, videoViews: { videoId → viewCount }, videoCount, type }

6. Обновление статистики канала
   └── trendChannels/{id} → { lastUpdated, totalViewCount, averageViews }

7. Уведомление
   └── notifications/{id} — результат синка с quota breakdown
```

### Refresh Avatar

При ручном синке можно передать `forceAvatarRefresh: true` — система обновит аватар канала через отдельный запрос `channels.list` (1 quota unit).

## YouTube API Quota

| Операция | Стоимость | Когда |
|----------|-----------|-------|
| `playlistItems.list` (50/страница) | 1 unit/страница | На каждый канал (пагинация) |
| `videos.list` (50/батч) | 1 unit/батч | На каждый канал (все видео) |
| `channels.list` (avatar refresh) | 1 unit | Только при forceAvatarRefresh |

**Пример:** канал с 1000 видео:
- Playlist: 1000 / 50 = 20 страниц = **20 units**
- Details: 1000 / 50 = 20 батчей = **20 units**
- **Итого: ~40 units за полный синк одного канала**

Уведомление содержит breakdown: `{ list, details, search }`.

## Error Handling

- **Per-channel isolation** — если один канал упал, остальные продолжают синкаться
- **Scheduled retry** — при падении всей функции Cloud Scheduler сделает retry (стандартное поведение)
- **Avatar non-critical** — ошибка при обновлении аватара не останавливает синк
- **Auth check** — `manualTrendSync` требует Firebase auth; без него → `HttpsError('unauthenticated')`
- **Missing API key** → `HttpsError('failed-precondition')` для manual, skip для scheduled

## Frontend Integration

Фронтенд узнаёт о завершении синка через:
1. **Notifications** — `onSnapshot` на коллекцию `notifications/`, ловит заголовок "Trends Sync: …"
2. **Channel data refresh** — `subscribeToTrendChannels` onSnapshot видит обновлённый `lastUpdated`
3. **Auto-refetch** — `useTrendVideos` сравнивает `channel.lastUpdated` с локальным `trend_last_fetch_{channelId}` в `localStorage`, видит stale-кеш и тянет видео из Firestore
4. **Toast** — `useTrendsSync` показывает toast при получении уведомления (только для синка, запущенного из header). Add Channel и per-channel sync полагаются на иконку нотификаций в header.

### Где дергается dispatch

- Header кнопка «Sync» → `useTrendsSync.handleSync` (все видимые каналы).
- Sidebar «⋮ → Sync» на канале → `useTrendsSidebar.handleSyncChannel` (конкретный канал, с `forceAvatarRefresh: true` если аватар был сломан).
- Sidebar «Add Competitor Channel» модалка → `AddChannelModal.handleSubmit` (только что созданный канал).

---

## Technical Implementation

### Файлы

| Файл | Назначение |
|------|-----------|
| `functions/src/trends/scheduledSync.ts` | `scheduledTrendSnapshot` — daily cron |
| `functions/src/trends/manualSync.ts` | `manualTrendSync` — callable from frontend (все ручные пути) |
| `functions/src/services/sync.ts` | `SyncService` — orchestration logic |
| `functions/src/services/youtube.ts` | `YouTubeService` — YouTube Data API wrapper |
| `functions/src/types.ts` | `TrendChannel`, `ProcessStats`, `Notification`, YouTube types |
| `functions/src/trends/__tests__/scheduledSync.test.ts` | Unit tests |
| `src/core/services/trendService.ts` | Frontend: `addTrendChannel` (только metadata+setDoc), `syncChannelCloud` (wrapper над `manualTrendSync` callable), `parseChannelInput` |
| `src/core/services/__tests__/trendService.test.ts` | Frontend unit tests для add-channel flow |
| `src/pages/Trends/Sidebar/AddChannelModal.tsx` | Модалка: metadata-fetch + `syncChannelCloud` dispatch |
| `src/pages/Trends/Sidebar/hooks/useTrendsSidebar.ts` | `handleSyncChannel` — per-channel dispatch через `syncChannelCloud` |
| `src/pages/Trends/hooks/useTrendsSync.ts` | Header кнопка Sync — dispatch всех видимых каналов через `syncChannelCloud` |

### Cloud Function Config

| Параметр | Значение |
|----------|---------|
| timeout | 540s (9 минут) |
| memory | 512MiB |
| schedule (daily) | `0 0 * * *` UTC |

### Firestore Write Pattern

```
SyncService.syncChannel():
  batch.set(videoRef, { ... }, { merge: true })  // Update existing, don't overwrite
  snapshotRef.set({ timestamp, videoViews, videoCount, type })
  channelRef.update({ lastUpdated, totalViewCount, averageViews })
```

`merge: true` гарантирует, что frontend-specific поля (nicheId, isHit) не затираются при синке.

### Тесты

Unit tests для `scheduledTrendSnapshot` проверяют:
- Использует `db.collection("users")`, НЕ `collectionGroup` (regression guard)
- Пропускает каналы с `trendSync.enabled = false`
- Пропускает каналы без API key
- Happy path: синкает и отправляет notification
- Error isolation: продолжает при ошибке одного канала
