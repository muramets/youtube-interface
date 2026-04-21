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
| 11 | Traffic | Delete any snapshot, не только последний | Medium | [delete-any-snapshot.md](backlog/delete-any-snapshot.md) |
| 12 | Chat / YT Research | Suggested Traffic tool: теги из описаний не анализируются | Medium | [Known Issues](features/chat/tools/layer-3-analysis/2-analyze-suggested-traffic-tool.md#known-issues) |
| 13 | Chat / YT Research | Suggested Traffic tool: не передаёт viewer type / traffic type / niche (user annotations) | Medium | [Known Issues](features/chat/tools/layer-3-analysis/2-analyze-suggested-traffic-tool.md#known-issues) |
| 14 | Video | Custom video: YouTube ID дублируется в `id` и `publishedVideoId` при привязке Published URL | Low | [Known Issues](features/knowledge/knowledge-items.md#known-issues) |
| 15 | Chat | MemoryCheckpoint: save/delete ошибки молча проглатываются (нет toast feedback) | Low | `src/features/Chat/components/MemoryCheckpoint.tsx` |
| 16 | Knowledge | headerComponents / HEADER_SIZE / INDENT дублированы между KnowledgeCard и MemoryCheckpoint | Low | `src/features/Knowledge/components/KnowledgeCard.tsx`, `src/features/Chat/components/MemoryCheckpoint.tsx` |
| 17 | Chat / Tools | `channelBasePath(ctx)` — extract shared utility из 5 knowledge handlers | Low | `functions/src/services/tools/handlers/knowledge/` (saveMemory, saveKnowledge, editKnowledge, getKnowledge, listKnowledge) |
| 19 | Chat / Memory | Удалить legacy `generateConcludeSummary` + `CONCLUDE_SYSTEM_PROMPT` из `memory.ts` (не используется в production, заменён tool-based Memorize через aiChat) | Low | [memory-system.md](features/chat/context/memory-system.md#technical-implementation) |
| 20 | Chat / Store | Optimistic message oscillation: message count 1→0→1 при reconciliation (optimistic→Firestore), вызывает 2-3 frame blink первого сообщения | Medium | `src/core/stores/chat/` — reconciliation должна быть atomic (replace, не remove+add) |
| 21 | Settings | Dead code: `SettingsDropdown` + `SettingsMenuSync` + `SettingsMenuMain` + `SettingsMenuApiKey` — не используются (legacy dropdown settings) | Low | `src/features/Settings/SettingsDropdown.tsx`, `src/features/Settings/components/SettingsMenuSync.tsx` |
| 22 | Chat / Tools | `ToolCallRecord` needs `id` field — enables stable React keys for separatePills + per-call progressMap keying. Claude: `tool_use_id`, Gemini: `functionCall` index. Both providers must propagate ID through SSE → frontend | Low | `src/core/types/chat/chat.ts`, `functions/src/services/claude/streamChat.ts`, `functions/src/services/gemini/streamChat.ts`, `src/core/stores/chat/slices/sendSlice.ts` |
| 23 | Video / Catalog | `useVideosCatalog` dedup: saved competitor videos in `videos/` get `ownership: 'own-published'` and stale `viewCount` (own entry wins over trend entry). Fix: detect competitor videos in own collection, prefer trendVideos data | Medium | `src/core/hooks/useVideosCatalog.ts` |
| 24 | Knowledge | KI Import — импорт KI из ZIP (Claude Code → HackTube), upsert по ID, version snapshot, discovery flags | Medium | [Roadmap](features/knowledge/knowledge-items.md#следующие-шаги-не-начаты) |
| 25 | Embeddings | `system/embeddingStats` stale — показывает ~24 indexed вместо реальных 4841. `findSimilarVideos` coverage field врёт. Нужен пересчёт stats из `globalVideoEmbeddings` (count by channel + packaging/visual presence) | Low | `functions/src/embedding/scheduledEmbeddingSync.ts`, `functions/src/services/tools/handlers/competition/findSimilarVideos.ts` |
| 26 | Music / Tools | Music registry is add-only via CLI. Need update/rename/delete для genres + tags (with cascade to tracks), plus deleteTrack / updateTrack. See Stage 1-2 in [cli-upload.md](features/music/cli-upload.md#roadmap) | Medium | `functions/src/services/tools/handlers/music/` |
