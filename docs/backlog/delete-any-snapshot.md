# Delete Any Snapshot (not just last)

## Что

Разрешить удалять **любой** snapshot в Traffic Sources и Suggested Traffic, а не только последний.

## Зачем

Сейчас пользователь может удалить только последний загруженный snapshot. Если он загрузил ошибочный CSV посередине timeline — нет способа его убрать без удаления всех последующих.

## Требования

- Удаление любого snapshot из sidebar (context menu или кнопка)
- При удалении "среднего" snapshot — пересчёт delta для следующего snapshot (delta берётся от предыдущего оставшегося, а не от удалённого)
- Confirmation modal с информацией: дата snapshot, кол-во строк, связанная версия
- Если snapshot содержит packagingSnapshot (денормализация после удаления версии) — предупреждение, что packaging данные будут потеряны

## Затрагивает

- **Suggested Traffic:**
  - `pages/Details/Sidebar/Traffic/SnapshotContextMenu.tsx`
  - `pages/Details/hooks/useSnapshotManagement.ts`
  - `core/services/traffic/TrafficSnapshotService.ts`
  - `core/services/traffic/TrafficDataService.ts`
- **Traffic Sources:**
  - `pages/Details/Sidebar/TrafficSource/TrafficSourceNav.tsx`
  - `core/services/suggestedTraffic/TrafficSourceService.ts`
  - `pages/Details/tabs/TrafficSource/hooks/useTrafficSourceData.ts`

## Связанные docs

- [Traffic Sources](../features/video-details/traffic-sources.md)
- [Suggested Traffic](../features/video-details/suggested-traffic/README.md)
