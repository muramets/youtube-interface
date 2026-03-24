# Backlog — Index

> Source of truth для деталей — feature docs и `docs/backlog/`.
> Этот файл только агрегирует ссылки. Не дублировать контент.
>
> **Добавление:** деталь в feature doc → строка в эту таблицу.
> **Завершение:** отметить `[x]` в feature doc → удалить строку → добавить в [archive](backlog/archive.md).

| # | Feature | Item | Priority | Link |
|---|---------|------|----------|------|
| 1 | Chat | Streaming dots пропадают при навигации | Medium | [Known Issues](features/chat/README.md#known-issues) |
| 2 | Chat / YT Research | `publishedAfter` early stop при пагинации | Low | [Roadmap](features/chat/tools/layer-1-discovery/2-browse-channel-videos-tool.md#roadmap) |
| 3 | Chat / YT Research | `lookupTrendVideos` — explicit tool для trend cache | Low | [Roadmap](features/chat/tools/layer-1-discovery/2-browse-channel-videos-tool.md#roadmap) |
| 4 | UI | DropZone consolidation (Audio → shared base) | Low | [dropzone-consolidation.md](backlog/dropzone-consolidation.md) |
| 7 | Packaging | Primary language: не-ENG локализация по умолчанию | Medium | [packaging.md](features/video-details/packaging.md#stage-5--localization--ux-polish--you-are-here) |
| 8 | Packaging | Shared tags across localizations | Medium | [packaging.md](features/video-details/packaging.md#stage-5--localization--ux-polish--you-are-here) |
| 9 | Packaging | Draft warning (напоминание о Published URL) | Medium | [packaging.md](features/video-details/packaging.md#stage-5--localization--ux-polish--you-are-here) |
| 10 | UI / Tables | Unified table: Traffic Sources + Suggested Traffic + Trends | Medium | [unified-table.md](backlog/unified-table.md) |
| 11 | Traffic | Delete any snapshot, не только последний | Medium | [delete-any-snapshot.md](backlog/delete-any-snapshot.md) |
| 12 | Chat / YT Research | Suggested Traffic tool: теги из описаний не анализируются | Medium | [Known Issues](features/chat/tools/layer-3-analysis/2-analyze-suggested-traffic-tool.md#known-issues) |
| 13 | Chat / YT Research | Suggested Traffic tool: не передаёт viewer type / traffic type / niche (user annotations) | Medium | [Known Issues](features/chat/tools/layer-3-analysis/2-analyze-suggested-traffic-tool.md#known-issues) |
| 14 | Video | Custom video: YouTube ID дублируется в `id` и `publishedVideoId` при привязке Published URL | Low | [Known Issues](features/knowledge/knowledge-items.md#known-issues) |
| 15 | Chat | MemoryCheckpoint: save/delete ошибки молча проглатываются (нет toast feedback) | Low | `src/features/Chat/components/MemoryCheckpoint.tsx` |
| 16 | Knowledge | headerComponents / HEADER_SIZE / INDENT дублированы между KnowledgeCard и MemoryCheckpoint | Low | `src/features/Knowledge/components/KnowledgeCard.tsx`, `src/features/Chat/components/MemoryCheckpoint.tsx` |
| 17 | Chat / Tools | `channelBasePath(ctx)` — extract shared utility из 5 knowledge handlers | Low | `functions/src/services/tools/handlers/knowledge/` (saveMemory, saveKnowledge, editKnowledge, getKnowledge, listKnowledge) |
| 18 | Sync | Multi-tab race condition: duplicate sync + notifications при нескольких открытых вкладках | Medium | [sync-architecture.md](features/sync-architecture.md#текущее-состояние) |
| 19 | Chat / Memory | Удалить legacy `generateConcludeSummary` + `CONCLUDE_SYSTEM_PROMPT` из `memory.ts` (не используется в production, заменён tool-based Memorize через aiChat) | Low | [memory-system.md](features/chat/context/memory-system.md#technical-implementation) |
| 20 | Chat / Store | Optimistic message oscillation: message count 1→0→1 при reconciliation (optimistic→Firestore), вызывает 2-3 frame blink первого сообщения | Medium | `src/core/stores/chat/` — reconciliation должна быть atomic (replace, не remove+add) |
