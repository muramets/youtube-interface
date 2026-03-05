# Backlog — Archive

Завершённые задачи. Исторический контекст.

| Item | Детали |
|------|--------|
| Shared Infrastructure: hardlinks → prebuild copy | `shared/models.ts` prebuild copy via `functions/scripts/copy-shared.mjs` |
| Rename `thinkingLevel` → `thinkingOptionId` | API contract rename across ~10 files |
| `browseChannelVideos` split into two tools | SRP: `getChannelOverview` + `browseChannelVideos`. [Архитектура](../features/chat/tools/README.md) |
| Cache consolidation (Phases 0-4) | `cached_suggested_traffic_videos/` → `cached_external_videos/`. [Task doc](../decisions/cache-consolidation/cache-consolidation-tasks.md) |
| `browseChannelVideos` own channel comparison | `ownChannelSync` — сравнение видео в приложении vs на YouTube |
