# Notification Categories

## Что это
Каждое уведомление имеет поле `category` (`NotificationCategory`), фильтруемое в UI. Заменяет старую фильтрацию по `title.includes('Sync')`.

## Текущее состояние
- [x] category field + обновлённые заголовки + фильтры в UI — DONE

## Категории

| Category | Источники | Заголовки |
|----------|-----------|-----------|
| `channel` | `useVideoSync`, `useAutoSync` | `Channel Sync: {N} videos updated`, `Channel Sync Failed: quota exceeded`, `Channel Sync Failed: API key missing` |
| `trends` | `useTrendsSidebar`, `AddChannelModal`, `scheduledSync`, `manualSync` | `Trends Sync: {Channel}`, `Trends Sync (daily): {N} videos across {M} channels`, `Trends Sync: {N} videos across {M} channels` |
| `smart-search` | `scheduledEmbeddingSync` | `Smart Search Updated: {N} videos processed`, `Smart Search Paused: monthly budget limit reached` |
| `checkin` | `useCheckinScheduler` | `Packaging Check-in Due` |
| `video` | `useVideoFetchRetry` | `Data update delayed`, `Failed to update data for Home Page` |

## UI Фильтры
- Табы: `All` | `Channel` | `Trends` | `Smart Search` | `Check-ins`
- Показываются только при наличии уведомлений из 2+ категорий
- `Check-ins` таб включает и `checkin`, и `video` категории
- Старые уведомления (без `category`) видны только во вкладке `All`

## Иконки
- **Channel Sync:** галочка/крестик (стандартная success/error иконка)
- **Trends Sync:** аватар канала (per-channel) или generic иконка (aggregate daily/manual)
- **Smart Search:** стандартная success/warning иконка
- **Check-ins:** thumbnail видео + цветной бордер (`customColor`)
- **Video (fetch retry):** thumbnail видео

## Technical Implementation

### Frontend
- `src/core/stores/notificationStore.ts` — `NotificationCategory` type, `category` field в `Notification`
- `src/features/Notifications/NotificationDropdown.tsx` — `FILTER_TABS` config, фильтрация по `n.category`
- `src/core/hooks/useVideoSync.ts` — category: `'channel'`
- `src/core/hooks/useAutoSync.ts` — category: `'channel'`, dedup check обновлён на `'Channel Sync Failed'`
- `src/core/hooks/useCheckinScheduler.ts` — category: `'checkin'`
- `src/core/hooks/useVideoFetchRetry.ts` — category: `'video'`
- `src/pages/Trends/Sidebar/hooks/useTrendsSidebar.ts` — category: `'trends'`
- `src/pages/Trends/Sidebar/AddChannelModal.tsx` — category: `'trends'`
- `src/pages/Trends/hooks/useTrendsSync.ts` — обновлён поиск: `n.category === 'trends' && n.title.startsWith('Trends Sync:')`

### Backend
- `functions/src/types.ts` — `category` field в `Notification` interface
- `functions/src/trends/scheduledSync.ts` — category: `'trends'`
- `functions/src/trends/manualSync.ts` — category: `'trends'` (через `sendNotification`)
- `functions/src/services/sync.ts` — `category: 'trends'` hardcoded в `sendNotification()`
- `functions/src/embedding/scheduledEmbeddingSync.ts` — category: `'smart-search'`, sends to all user/channel pairs

### Backward Compatibility
- `category` — optional field. `functions/src/types.ts` и `notificationStore.ts` — `category?`
- Старые уведомления без category: отображаются в `All`, не попадают в категорийные табы
