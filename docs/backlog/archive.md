# Backlog — Archive

Завершённые задачи. Исторический контекст.

| Item | Детали |
|------|--------|
| Shared Infrastructure: hardlinks → prebuild copy | `shared/models.ts` prebuild copy via `functions/scripts/copy-shared.mjs` |
| Rename `thinkingLevel` → `thinkingOptionId` | API contract rename across ~10 files |
| `browseChannelVideos` split into two tools | SRP: `getChannelOverview` + `browseChannelVideos`. [Архитектура](../features/chat/tools/README.md) |
| Cache consolidation (Phases 0-5, COMPLETE) | `cached_suggested_traffic_videos/` → `cached_external_videos/`. 10,110 docs migrated (Phase 0), old collection deleted (Phase 5). [Task doc](../archive/tasks/cache-consolidation/cache-consolidation-tasks.md) |
| Multi-tab race condition (#18) | `useAutoSync` cross-tab guard: re-read `lastGlobalSync` from Firestore before sync. [sync-architecture.md](../features/sync-architecture.md) |
| `browseChannelVideos` own channel comparison | `ownChannelSync` — сравнение видео в приложении vs на YouTube |
| Tool pill UI gap during large tool_use generation | `toolCallStart` SSE event fires immediately on `content_block_start`, pill appears before JSON args. Streaming dedup fix (onSnapshot vs SSE race). Registry-driven labels + video ID extractors. |
| Tool pills registry refactor | Labels, video ID extractors, expandability consolidated into `toolRegistry.ts` as SSOT. `toolCallGrouping.ts` 399→97 lines. |
| Prompt Caching Stage 3 (Gemini Context Caching) | `CachedContent` lifecycle manager, `cacheReadMultiplier: 0.1` × 4 Gemini models, cache integration in streamChat agentic loop. [Feature doc](../features/chat/context/prompt-caching.md), [Task doc](../archive/tasks/chat/context/gemini-context-caching-tasks.md) |
