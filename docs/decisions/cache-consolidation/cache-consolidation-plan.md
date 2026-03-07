# Cache Consolidation: `cached_suggested_traffic_videos/` → `cached_external_videos/`

## Цель
Объединить `cached_suggested_traffic_videos/` в `cached_external_videos/`. Убрать trendChannels fallback из tool handlers (trend data access — отдельный будущий тул).

**До:**
```
getMultipleVideoDetails: videos/ → suggested_cache/ → external_cache/ → YouTube API   (3 parallel reads + API)
browseChannelVideos:     videos/ + external_cache/ → trendChannels/ → YouTube API       (2 parallel + cond + API)
mentionVideo:            videos/ → suggested_cache/                                     (2 sequential reads)
viewThumbnails:          videos/ + suggested_cache/                                     (2 parallel reads)
```

**После:**
```
getMultipleVideoDetails: videos/ → external_cache/ → YouTube API   (2 parallel reads + API)
browseChannelVideos:     videos/ + external_cache/ → YouTube API    (2 parallel reads + API)
mentionVideo:            videos/ → external_cache/                  (2 sequential reads)
viewThumbnails:          videos/ + external_cache/                  (2 parallel reads)
```

> [!IMPORTANT]
> **Trade-off: `trendChannels/` не консолидируется.**
> `trendChannels/` используется в 20+ местах фронтенда (trendService, useVideoDeltaMap, snapshots, Sidebar).
> Вместо скрытого fallback — будущий отдельный тул `lookupTrendVideos` (explicit capability).
> `sync.ts` не меняется — пишет только в `trendChannels/` как раньше.

---

## Phase 0: Migration Script (BEFORE code deploy)

> [!CAUTION]
> **Миграция ОБЯЗАТЕЛЬНО запускается ДО деплоя Phase 1-2.** Иначе handlers будут искать в `cached_external_videos/`, а данные ещё в старой коллекции — потеря доступа к видео.

#### [NEW] `functions/scripts/migrateSuggestedToExternal.ts`

Admin SDK script:
1. Для каждого user → channel: read all docs из `cached_suggested_traffic_videos/`
2. Skip если doc уже есть в `cached_external_videos/` (idempotent)
3. Copy с `source: "suggested_traffic"` + `migratedAt: Date.now()`
4. Batch write (500 ops per batch), logging progress
5. **НЕ удаляет** origin docs — cleanup отдельно после подтверждения

---

## Phase 1: Backend — Unified Cache Reads + Remove Trend Fallback

#### [MODIFY] `functions/src/services/tools/handlers/getMultipleVideoDetails.ts`

**Было:** 3 parallel reads (`videos/` + `suggested_cache/` + `external_cache/`) → YouTube API
**Станет:** 2 parallel reads (`videos/` + `external_cache/`) → YouTube API

- Удалить `suggestedRefs` batch read (строки 32, 36-37, 52-54)
- Удалить `"suggested_cache"` из `CollectionSource` type
- Cascade: `own → external_cache → youtube_api` (true 3-level)

#### [MODIFY] `functions/src/services/tools/handlers/browseChannelVideos.ts`

**Удалить trend fallback** (строки 98-137, ~40 строк):
- Весь блок "Trend channel cache check (level 2)"
- Переменную `trendCacheHits` и её использование в response
- Комментарий о 3-level cascade → обновить на 2-level

Cascade: `own + external_cache → youtube_api` (true 2-level)

#### [MODIFY] `functions/src/services/tools/handlers/analyzeSuggestedTraffic.ts`

Строки 217, 269: `cached_suggested_traffic_videos/` → `cached_external_videos/`

> [!NOTE]
> Это reads (`db.doc()` refs для `db.getAll()`), не writes. `enrichedData.set()` — `Map.set()` (in-memory). Source tagging не нужен.

#### [MODIFY] `functions/src/services/tools/handlers/mentionVideo.ts`

Строка 23: `cached_suggested_traffic_videos/` → `cached_external_videos/`

#### [MODIFY] `functions/src/services/tools/handlers/viewThumbnails.ts`

Строки 31, 86: `cached_suggested_traffic_videos/` → `cached_external_videos/`

---

## Phase 2: Frontend — Path + Service Rename

#### [MODIFY] `src/core/services/videoService.ts`

- `getSuggestedVideosPath` → `getExternalVideosPath`, path: `cached_external_videos`
- ~~`fetchSuggestedVideos`~~ → **DELETE** (dead code — 0 callers)
- `batchUpdateSuggestedVideos` → `batchUpdateExternalVideos`

#### [RENAME + MODIFY] `src/pages/Details/tabs/Traffic/hooks/useSuggestedVideoLookup.ts` → `useExternalVideoLookup.ts`

- Import: `getSuggestedVideosPath` → `getExternalVideosPath`
- Query key: `'suggestedVideo'` → `'externalVideo'`
- Exports: `suggestedVideoQueryKey` → `externalVideoQueryKey`, `suggestedVideoQueryPrefix` → `externalVideoQueryPrefix`
- Hook: `useSuggestedVideoLookup` → `useExternalVideoLookup`

#### [MODIFY] `src/pages/Details/tabs/Traffic/hooks/useMissingTitles.ts`

- `batchUpdateSuggestedVideos` → `batchUpdateExternalVideos`
- Add `source: "suggested_traffic"` to batch write data
- Update query prefix import

#### [MODIFY] `src/pages/Details/tabs/Traffic/TrafficTab.tsx`

Import + usage: `useSuggestedVideoLookup` → `useExternalVideoLookup` (new file path)

#### [MODIFY] `src/core/utils/migration/suggestedVideosMigration.ts`

Update import: `getSuggestedVideosPath` → `getExternalVideosPath`

---

## Phase 3: Tests

#### [MODIFY] `functions/src/services/tools/handlers/__tests__/getMultipleVideoDetails.bugfix.test.ts`

- Убрать `cached_suggested_traffic_videos/` mock reads
- Обновить cascade expectations (3-level вместо 4-level)

#### [MODIFY] `functions/src/services/tools/handlers/__tests__/viewThumbnails.handler.test.ts`

Path string: `cached_suggested_traffic_videos` → `cached_external_videos`

#### [MODIFY] `functions/src/services/tools/handlers/__tests__/browseChannelVideos.test.ts`

- Удалить trendChannel-related test helpers (если есть)
- Убрать `trendCacheHits` из expected responses

> [!NOTE]
> **Frontend тесты:** Traffic tab hooks не имеют тестов. Написание — отдельная задача.

---

## Phase 4: Documentation

6 doc-файлов содержат ссылки на `cached_suggested_traffic_videos`:

| Файл | Упоминания |
|------|-----------|
| `docs/features/chat/youtube-research-tools.md` | 5 |
| `docs/archive/tasks/chat/youtube-research-tools-tasks.md` | 4 |
| `docs/features/chat/README.md` | 2 |
| `docs/features/chat/view-thumbnails.md` | 1 |
| `docs/features/chat/context-token-optimization.md` | 1 |
| `docs/features/analyze-suggested-traffic-tool.md` | 1 |

Все `cached_suggested_traffic_videos` → `cached_external_videos`, обновить cascade описания, убрать trendChannels из tool handler docs.

---

## Summary

| Phase | Файл | Тип | Суть |
|-------|-------|-----|------|
| 0 | `migrateSuggestedToExternal.ts` | NEW | Migration script (запустить ДО деплоя) |
| 1 | `getMultipleVideoDetails.ts` | MODIFY | Убрать suggested refs (3 parallel → 2) |
| 1 | `browseChannelVideos.ts` | MODIFY | Убрать trend fallback (~40 строк) |
| 1 | `analyzeSuggestedTraffic.ts` | MODIFY | Path rename (reads only) |
| 1 | `mentionVideo.ts` | MODIFY | Path rename |
| 1 | `viewThumbnails.ts` | MODIFY | Path rename |
| 2 | `videoService.ts` | MODIFY | Path + method rename, delete dead code |
| 2 | `useSuggestedVideoLookup.ts` | RENAME | → `useExternalVideoLookup.ts` |
| 2 | `useMissingTitles.ts` | MODIFY | Rename imports + add source |
| 2 | `TrafficTab.tsx` | MODIFY | Rename import |
| 2 | `suggestedVideosMigration.ts` | MODIFY | Rename import |
| 3 | `getMultipleVideoDetails.bugfix.test.ts` | MODIFY | Update mocks |
| 3 | `viewThumbnails.handler.test.ts` | MODIFY | Update paths |
| 3 | `browseChannelVideos.test.ts` | MODIFY | Remove trend expectations |
| 4 | 6 doc files | MODIFY | Path references + cascade updates |

| 5 | `deleteSuggestedTrafficCache.ts` | NEW | Cleanup script (after full verification) |

**21 файл:** 17 MODIFY + 2 NEW + 1 RENAME + 1 dead code DELETE

---

## Phase 5: Cleanup Old Collection

> [!CAUTION]
> Destructive and irreversible. Only after all phases deployed and verified in production.

#### [NEW] `functions/scripts/deleteSuggestedTrafficCache.ts`

Admin SDK script — batch delete all docs from `cached_suggested_traffic_videos/`. After cleanup: delete both migration and cleanup scripts (one-time use).

---

## Deployment Order

```
1. Backup Firestore (recommended)
2. Phase 0: migration script                              ✅ DONE (10,110 docs)
3. Verify: spot-check cached_external_videos/              ✅ DONE
4. Phase 1: backend code changes                           ✅ DONE (325 backend tests)
5. Phase 2: frontend code changes                          ✅ DONE (400 total tests)
6. Phase 3: test updates                                   ✅ DONE (merged into Phase 1)
7. Deploy Phases 1-3
8. Phase 4: doc updates                                    ✅ DONE (6 doc files updated)
9. Phase 5: delete cached_suggested_traffic_videos/        (after production verification)
```

---

## Verification Plan

### Automated Tests
```bash
npm run test:run                    # all tests pass
npx vitest run --project functions  # backend
npm run lint && npm run typecheck   # clean
```

### Manual Verification
1. **Post-migration:** spot-check `cached_external_videos/` documents have `source: "suggested_traffic"` + `migratedAt`
2. **Suggested Traffic tab:** open video — enriched data loads from new collection
3. **AI Chat:** `getMultipleVideoDetails` — cache hit from `cached_external_videos/`, no suggested_cache refs
4. **AI Chat:** `mentionVideo` + `viewThumbnails` — lookup works from `cached_external_videos/`
5. **AI Chat:** `browseChannelVideos` — no trendCacheHits in response, videos fetched from YouTube API or external cache only
