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
| 5 | Infrastructure | Cache consolidation Phase 5 (cleanup old collection) | Low | [cache-consolidation-tasks.md](decisions/cache-consolidation/cache-consolidation-tasks.md#phase-5-cleanup-old-collection) |
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
