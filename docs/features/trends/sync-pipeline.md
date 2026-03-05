# Trends — Sync Pipeline

> Бэкенд-система синхронизации данных конкурентов с YouTube.

## Что это такое

**Аналогия:** Фотоаппарат, который каждый день делает снимок статистики конкурентов. Каждый "снимок" (snapshot) запоминает, сколько просмотров было у каждого видео в тот момент. Сравнивая снимки за разные дни, мы видим рост.

## Как работает синхронизация

### Два триггера

1. **Автоматический (daily)** — Cloud Scheduler запускает `scheduledTrendSnapshot` каждый день в 00:00 UTC. Проходит по ВСЕМ пользователям и ВСЕМ их каналам.
2. **Ручной** — пользователь нажимает кнопку Sync на фронтенде, вызывается `manualTrendSync`. Синкает только каналы текущего пользователя.

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
1. **Notifications** — `onSnapshot` на коллекцию `notifications/`, ловит заголовок "Manual Sync Complete"
2. **Channel data refresh** — `subscribeToTrendChannels` onSnapshot видит обновлённый `lastUpdated`
3. **Toast** — `useTrendsSync` хук показывает toast при получении уведомления

---

## Technical Implementation

### Файлы

| Файл | Назначение |
|------|-----------|
| `functions/src/trends/scheduledSync.ts` | `scheduledTrendSnapshot` — daily cron |
| `functions/src/trends/manualSync.ts` | `manualTrendSync` — callable from frontend |
| `functions/src/services/sync.ts` | `SyncService` — orchestration logic |
| `functions/src/services/youtube.ts` | `YouTubeService` — YouTube Data API wrapper |
| `functions/src/types.ts` | `TrendChannel`, `ProcessStats`, `Notification`, YouTube types |
| `functions/src/trends/__tests__/scheduledSync.test.ts` | Unit tests |

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
