# searchDatabase — Task Doc

## Overview

Добавить free-text семантический поиск по всей базе видео конкурентов. Один новый инструмент `searchDatabase` в Layer 4 (Competition). Вся embedding/vector search инфраструктура уже существует — нужен query embedding generator, handler, definition, registration и тесты.

**Feature doc:** `docs/features/chat/tools/layer-4-competition/5-search-database-tool.md` — READ BEFORE ANY PHASE.

## Quick Context Recovery

Если потерян контекст — читать в этом порядке:
1. Этот файл (статус + чеклисты)
2. `docs/features/chat/tools/layer-4-competition/5-search-database-tool.md` (feature doc: дизайн, параметры, return format, Query vs Document Embedding)
3. `functions/src/services/tools/handlers/competition/findSimilarVideos.ts` (ближайший паттерн — handler с vector search + enrichment)
4. `functions/src/embedding/packagingEmbedding.ts` (паттерн для `generateQueryEmbedding`)
5. `functions/src/services/tools/definitions.ts` (паттерн tool definition)
6. `functions/src/services/tools/executor.ts` (handler registration)

### Key Decisions (carry forward)

1. **`generateQueryEmbedding` — отдельная функция, НЕ переиспользуем `generatePackagingEmbedding`.** Причина: `generatePackagingEmbedding` формирует input как `Title: {title}\nTags: {tags}\nDescription: {desc}`, пустые Tags/Description сдвигают вектор. `generateQueryEmbedding` отправляет чистый текст с `taskType: RETRIEVAL_QUERY`. См. feature doc секцию "Query vs Document Embedding".
2. **Существующие embeddings НЕ меняем.** Не добавляем `taskType: RETRIEVAL_DOCUMENT` в `generatePackagingEmbedding`. `findSimilarVideos` = document↔document (симметричная задача), `searchDatabase` = query↔document (асимметричная). Дефолтный режим Gemini — приемлемый компромисс для обоих.
3. **Только packaging mode.** Visual mode бессмысленен для текстового запроса. Нет `mode` параметра.
4. **Минимум фильтров.** Только `channelIds` (pre-filter до vector search). Post-filters (dateRange, performanceTier) не добавляем — LLM фильтрует сам из обогащённых результатов.
5. **Budget tracking не нужен.** $0.00004/запрос — пренебрежимо. Нет Firestore write в `system/embeddingBudget`.
6. **`relevanceScore`, НЕ `similarityScore`.** Семантически точнее для text→document поиска.
7. **trendChannel Firestore doc ID === YouTube Channel ID.** Подтверждено: `trendService.ts:496` — `id: item.id` из YouTube API `channels.list`.

## Agent Orchestration Strategy

Main context = **executor + orchestrator**.
Subagents для Review Gate (fresh eyes).

Задача компактная (3 фазы) — параллелизация внутри фаз минимальна.

### Phase 1 parallelization plan
```
T1.1 (generateQueryEmbedding) — SEQUENTIAL FIRST (foundation)
T1.2 (tests) — after T1.1
→ Review Gate 1: subagent
```

### Phase 2 parallelization plan
```
T2.1 (handler) — SEQUENTIAL FIRST
T2.2 + T2.3 (definition + executor registration) — PARALLEL after T2.1
T2.4 (tests) — SEQUENTIAL LAST
→ Review Gate 2: subagent
```

### Phase 3 parallelization plan
```
T3.1 + T3.2 + T3.3 (feature doc + README + chat README) — PARALLEL
→ Review Gate 3: subagent
```

### FINAL phase
```
R1 (Architecture Review) — subagent → fix findings
R2 (Production Readiness) — subagent → fix findings
Final verification — all test suites + lint + typecheck + docs
```

---

## Phase Status

| Phase | Goal | Status |
|-------|------|--------|
| 1 | Query embedding generator + tests | DONE |
| 2 | Handler + definition + executor + tests | DONE |
| 3 | Documentation updates | DONE |
| FINAL | Double review-fix cycle (R1: Architecture, R2: Production Readiness) | DONE |

## Current Test Count

- **Frontend:** 284 (22 files) — verify via `npx vitest run --project frontend`
- **Backend:** 575 (41 files) — verify via `npx vitest run --project functions`
- **Total:** 859 (63 files)

---

## Phase 1: Query Embedding Generator

**Goal:** Создать `generateQueryEmbedding` — функцию для генерации 768d embedding из свободного текстового запроса с `taskType: RETRIEVAL_QUERY`.

### Critical Context

- `@google/genai` SDK: `taskType` = `string` в `EmbedContentConfig` (не enum). Валидные значения: `RETRIEVAL_QUERY`, `RETRIEVAL_DOCUMENT`, `SEMANTIC_SIMILARITY`, `CLASSIFICATION`, `CLUSTERING`
- `client.models.embedContent({ model, contents, config: { outputDimensionality, taskType } })` — `taskType` передаётся в `config`
- ⚠️ `getClient(apiKey)` из `functions/src/services/gemini/client.ts` — singleton, переиспользовать (не создавать новый клиент)
- ⚠️ `EMBEDDING_DIMENSIONS.packaging = 768` — константа из `functions/src/embedding/types.ts`
- ⚠️ `generatePackagingEmbedding` — НЕ копировать. Новая функция проще: без Title/Tags/Description обёрток, без truncation (query короткий)
- ⚠️ НЕ добавлять `taskType` в `generatePackagingEmbedding` — Key Decision #2

### Tasks

- [x] **T1.1** — Create `generateQueryEmbedding`
  - Create: `functions/src/embedding/queryEmbedding.ts`
  - Function: `generateQueryEmbedding(query: string, apiKey: string): Promise<number[] | null>`
  - Logic:
    1. `getClient(apiKey)` → cached GoogleGenAI
    2. `client.models.embedContent({ model: "gemini-embedding-001", contents: query, config: { outputDimensionality: EMBEDDING_DIMENSIONS.packaging, taskType: "RETRIEVAL_QUERY" } })`
    3. Extract `response.embeddings?.[0]?.values`
    4. Return vector or `null` on error
  - Error handling: try-catch → `logger.warn("queryEmbedding:failed", { query, error })` → return `null`
  - ⚠️ Input — чистый текст, НЕ форматировать как `Title: ...`. Просто `contents: query`
  - ⚠️ `query` max length: Gemini embedding API принимает до ~8192 tokens. Для поисковых запросов это не проблема (обычно < 50 слов). Не усложнять truncation

- [x] **T1.2** — Tests для `generateQueryEmbedding`
  - Create: `functions/src/embedding/__tests__/queryEmbedding.test.ts`
  - Mock: `getClient` из `services/gemini/client.ts` (тот же паттерн что в `packagingEmbedding.test.ts`)
  - Cases:
    - Success: query → 768d vector returned
    - Empty response: `embeddings?.[0]?.values` is null/empty → returns null
    - API error: `embedContent` throws → returns null, logs warning
    - ⚠️ Verify: `taskType: "RETRIEVAL_QUERY"` передаётся в `config` (assert on mock call args)
    - ⚠️ Verify: `contents` = raw query string (NOT formatted as `Title: ...`)

### Verification

```bash
npx vitest run --project functions     # backend tests pass (incl. new)
npm run check                          # lint + typecheck + doc links
```

**MANDATORY: Update this file before proceeding:**
- [x] Mark completed tasks above
- [x] Update Phase Status table: Phase 1 → DONE
- [x] Record test count in "Current Test Count" section

### Review Gate 1

**Prompt:** "Review Phase 1 of searchDatabase (query embedding generator). Read `docs/features/chat/tools/layer-4-competition/5-search-database-tool.md` (feature doc, especially 'Query vs Document Embedding' section) for full context. Check:
1. Does `functions/src/embedding/queryEmbedding.ts` pass `taskType: 'RETRIEVAL_QUERY'` in config?
2. Does it send raw query text (NOT `Title: {query}\nTags: \nDescription: `)?
3. Does it use `getClient()` from `services/gemini/client.ts` (same singleton as `packagingEmbedding.ts`)?
4. Does it use `EMBEDDING_DIMENSIONS.packaging` constant (NOT hardcoded 768)?
5. Does `generatePackagingEmbedding` remain UNCHANGED (no `taskType` added)?
6. Do tests verify `taskType` in mock call args?
7. Do tests verify raw text input (not formatted)?
8. Run `npx vitest run --project functions && npm run check`."

Fix all findings before moving to Phase 2.

---

## Phase 2: Handler + Tool Registration

**Goal:** Создать handler, tool definition и зарегистрировать в executor. Это делает `searchDatabase` доступным для LLM.

### Critical Context

- Handler паттерн: `functions/src/services/tools/handlers/competition/findSimilarVideos.ts` — ближайший аналог (vector search + enrichment)
- ⚠️ `ToolContext` interface (`tools/types.ts`): `{ userId, channelId, youtubeApiKey?, reportProgress? }`
- ⚠️ Handler signature: `(args: Record<string, unknown>, ctx: ToolContext) => Promise<Record<string, unknown>>`
- ⚠️ `TOOL_NAMES` — `const` object с `as const` (НЕ TypeScript enum). Синтаксис: `SEARCH_DATABASE: "searchDatabase",` (двоеточие, не `=`). Строка 20–32 в `definitions.ts`
- ⚠️ `TOOL_DECLARATIONS` — exported array (строка 395–407). Каждый tool объявлен как `const` переменная, затем добавлен в массив. Нужно: (1) создать `const searchDatabase: ToolDefinition = { ... }` и (2) добавить `searchDatabase` в массив `TOOL_DECLARATIONS`
- ⚠️ `ToolDefinition` interface (из `services/ai/types.ts`): поля `name: string`, `description: string`, `parametersJsonSchema: Record<string, unknown>`. Имя поля — именно `parametersJsonSchema` (подтверждено)
- ⚠️ `HANDLERS` map в `executor.ts` — добавить `[TOOL_NAMES.SEARCH_DATABASE]: handleSearchDatabase`
- ⚠️ `process.env.GEMINI_API_KEY` — используется в handler напрямую (тот же паттерн что `findSimilarVideos`)
- ⚠️ `channelIds` параметр: если передан — валидировать что это подмножество user's trend channels. Если не передан — использовать все trend channels
- ⚠️ `relevanceScore = Math.round(Math.max(0, 1 - distance) * 1000) / 1000` — тот же расчёт что `similarityScore` в `findSimilarVideos`, но другое имя поля
- ⚠️ Coverage: читать `system/embeddingStats`, суммировать только `packaging` counts (не visual). Паттерн: `findSimilarVideos:computeCoverage` с `mode === "packaging"`
- ⚠️ `channelMeta` Map для `dataFreshness` — тот же паттерн: `normalizeLastUpdated(data.lastUpdated)`

### Tasks

- [x] **T2.1** — Create handler
  - Create: `functions/src/services/tools/handlers/competition/searchDatabase.ts`
  - Function: `handleSearchDatabase(args, ctx): Promise<Record<string, unknown>>`
  - Flow (точно по feature doc, секция "Поток выполнения handler"):
    1. Parse & validate: `query` (string, min 3 chars), `channelIds` (optional string[]), `limit` (number, default 20, max 50)
    2. `basePath = users/${ctx.userId}/channels/${ctx.channelId}`
    3. Get trend channels: read `${basePath}/trendChannels` collection
    4. If `channelIds` arg provided → filter to only those present in user's trend channels
    5. If no trend channels → `{ error: "No trend channels tracked. Add channels in Trends first." }`
    6. Build `channelMeta` Map: `channelId → { title, lastUpdated: normalizeLastUpdated(data.lastUpdated) }`
    7. `apiKey = process.env.GEMINI_API_KEY` → if missing → `{ error: "Gemini API key not configured." }`
    8. `ctx.reportProgress?.("Generating query embedding...")`
    9. `queryVector = await generateQueryEmbedding(query, apiKey)` → if null → `{ error: "Failed to generate query embedding. Try again later." }`
    10. `ctx.reportProgress?.("Searching database...")`
    11. `searchResults = await findNearestVideos({ queryVector, field: "packagingEmbedding", youtubeChannelIds, limit: limit + 10 })`
    12. `hiddenIds = await getHiddenVideoIds(basePath)` → filter
    13. `totalFound = filtered.length`
    14. `truncated = filtered.slice(0, limit)`
    15. `ctx.reportProgress?.("Computing view deltas...")`
    16. `deltasMap = await getViewDeltas(ctx.userId, ctx.channelId, resultVideoIds, channelIdHints)`
    17. Compute per-channel percentile groups via `assignPercentileGroups()` — same pattern as `findSimilarVideos:306-326`
    18. Compute coverage (packaging only) — read `system/embeddingStats`, sum `byChannel[channelId].packaging` and `byChannel[channelId].total` for user's channels
    19. Build response: `{ query, results: [...], totalFound, coverage, dataFreshness }`
  - Result item fields:
    ```typescript
    {
      videoId, title, channelId, channelTitle,
      relevanceScore,  // Math.round(Math.max(0, 1 - distance) * 1000) / 1000
      publishedAt, viewCount,
      viewDelta24h, viewDelta7d, viewDelta30d,
      performanceTier,
    }
    ```
  - Error handling: wrap in try-catch → `{ error: "Failed to search database: ${msg}" }`
  - ⚠️ Imports:
    - `generateQueryEmbedding` from `../../../embedding/queryEmbedding.js`
    - `findNearestVideos` from `../../../embedding/vectorSearch.js`
    - `getViewDeltas` from `../../trendSnapshotService.js`
    - `assignPercentileGroups` from `../../../shared/percentiles.js`
    - `getHiddenVideoIds` from `../utils/getHiddenVideoIds.js`
    - `normalizeLastUpdated` from `../utils/normalizeLastUpdated.js`
    - `db` from `../../../shared/db.js`
    - `ToolContext` from `../types.js`
    - `EmbeddingStats` from `../../../embedding/types.js`
    - `PercentileGroup` from `../../../shared/percentiles.js`

- [x] **T2.2** — Tool definition
  - File: `functions/src/services/tools/definitions.ts`
  - **Step 1:** Add to `TOOL_NAMES` const object (строка ~31, перед `} as const`):
    ```typescript
    SEARCH_DATABASE: "searchDatabase",
    ```
    ⚠️ Двоеточие (`:`) — это const object, НЕ enum. `=` даст syntax error
  - **Step 2:** Create `const searchDatabase: ToolDefinition` (после `findSimilarVideos` declaration):
    ```typescript
    const searchDatabase: ToolDefinition = {
      name: TOOL_NAMES.SEARCH_DATABASE,
      description: "Search the competitor video database using free-text semantic search. Use when the user asks about topics, themes, or concepts across competitor videos (e.g., 'what videos exist about AI?', 'find videos about cooking challenges'). Returns semantically relevant videos ranked by relevance with view deltas and performance tiers. Only searches videos from user's tracked trend channels. For finding videos similar to a SPECIFIC video, use findSimilarVideos instead.",
      parametersJsonSchema: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Free-text search query describing what to find (e.g., 'Iceland travel vlog', 'AI tools tutorial'). Minimum 3 characters."
          },
          channelIds: {
            type: "array",
            items: { type: "string" },
            description: "Optional. YouTube channel IDs (UC...) to limit search to specific channels. If omitted, searches all tracked trend channels."
          },
          limit: {
            type: "number",
            description: "Maximum number of results to return. Default: 20, max: 50."
          }
        },
        required: ["query"]
      }
    };
    ```
  - **Step 3:** Add `searchDatabase` to `TOOL_DECLARATIONS` array (строка ~407, перед `];`):
    ```typescript
    export const TOOL_DECLARATIONS: ToolDefinition[] = [
      // ... existing tools ...,
      findSimilarVideos,
      searchDatabase,    // ← add here
    ];
    ```
  - ⚠️ Description должен помогать LLM выбрать правильный инструмент: `searchDatabase` vs `findSimilarVideos` vs `browseTrendVideos`. Ключевое: "free-text search" vs "similar to specific video" vs "structured filters"

- [x] **T2.3** — Executor registration
  - File: `functions/src/services/tools/executor.ts`
  - Add import: `import { handleSearchDatabase } from "./handlers/searchDatabase.js"`
  - Add to `HANDLERS` map: `[TOOL_NAMES.SEARCH_DATABASE]: handleSearchDatabase`

- [x] **T2.4** — Tests для handler
  - Create: `functions/src/services/tools/handlers/competition/__tests__/searchDatabase.test.ts`
  - Mocks: `generateQueryEmbedding`, `findNearestVideos`, `getViewDeltas`, `getHiddenVideoIds`, `assignPercentileGroups`, `db` (Firestore admin)
  - Паттерн: `findSimilarVideos.test.ts` (тот же набор mocks + структура)
  - Cases:
    - **Happy path:** query → embedding → search → enriched results
    - **Query too short:** `{ query: "ab" }` → error
    - **Empty query:** `{ query: "" }` → error
    - **No trend channels:** empty collection → error
    - **Gemini API key missing:** `process.env.GEMINI_API_KEY` undefined → error
    - **Embedding generation fails:** `generateQueryEmbedding` returns null → error
    - **Hidden videos filtered:** result contains hidden video → filtered out, totalFound decremented
    - **channelIds filter:** only channels from arg are searched
    - **channelIds partial match:** some channelIds not in user's trend channels → ignored, search only matching
    - **Limit capping:** `limit: 100` → capped to 50
    - **Default limit:** no limit arg → 20
    - **View deltas enrichment:** deltas present in results
    - **Performance tiers:** tiers computed per-channel
    - **Coverage:** reads `system/embeddingStats`, returns packaging counts
    - **relevanceScore calculation:** `1 - distance`, clamped to [0, 1], 3 decimal places
    - **dataFreshness:** includes only channels that appear in results
    - **reportProgress called:** verify progress callbacks invoked

### Verification

```bash
npx vitest run --project functions     # backend tests pass (incl. new)
npm run check                          # lint + typecheck + doc links
```

**MANDATORY: Update this file before proceeding:**
- [x] Mark completed tasks above
- [x] Update Phase Status table: Phase 2 → DONE
- [x] Record test count in "Current Test Count" section

### Review Gate 2

**Prompt:** "Review Phase 2 of searchDatabase (handler + definition + registration). Read `docs/features/chat/tools/layer-4-competition/5-search-database-tool.md` for full context. Check:
1. Does handler use `generateQueryEmbedding` (NOT `generatePackagingEmbedding`)?
2. Does handler validate `query.length >= 3`?
3. Does handler cap limit to MAX_LIMIT (50)?
4. Does handler filter `channelIds` arg against user's actual trend channels?
5. Is `relevanceScore` calculated as `1 - distance` (not raw distance)?
6. Does coverage read only `packaging` counts from `system/embeddingStats` (not visual)?
7. Does `totalFound` represent count AFTER hidden filter, BEFORE limit truncation?
8. Is over-fetch `limit + 10` applied in `findNearestVideos` call?
9. Does tool description clearly differentiate from `findSimilarVideos` and `browseTrendVideos`?
10. Is handler registered in executor.ts `HANDLERS` map?
11. Are `channelIdHints` passed to `getViewDeltas` for caching optimization?
12. Do tests cover all edge cases from feature doc?
13. Run `npx vitest run --project functions && npm run check`."

Fix all findings before moving to Phase 3.

---

## Phase 3: Documentation Updates

**Goal:** Обновить feature doc, telescope README и chat README, отметив реализацию.

### Tasks

- [x] **T3.1** — Update feature doc
  - File: `docs/features/chat/tools/layer-4-competition/5-search-database-tool.md`
  - Change "Текущее состояние" → "**Реализовано.**" + summary
  - Add tests table to Technical Implementation section

- [x] **T3.2** — Update Chat README
  - File: `docs/features/chat/README.md`
  - Mark `searchDatabase` checkbox as done: `- [x]`
  - Update "Стадия 6" text if needed

- [x] **T3.3** — Update competitive-intelligence doc
  - File: `docs/features/chat/tools/layer-4-competition/competitive-intelligence.md`
  - Add `searchDatabase` to "Текущее состояние" list (if referenced there)

### Verification

```bash
npm run check     # lint + typecheck + doc links
```

**MANDATORY: Update this file before proceeding:**
- [x] Mark completed tasks above
- [x] Update Phase Status table: Phase 3 → DONE

### Review Gate 3

**Prompt:** "Review Phase 3 of searchDatabase (documentation). Check:
1. Is feature doc status updated to 'Реализовано'?
2. Is test count recorded in feature doc Technical Implementation?
3. Is checkbox marked in chat README (`docs/features/chat/README.md`)?
4. Are all cross-doc links valid (`npm run check` passes)?
5. Is searchDatabase mentioned in competitive-intelligence.md if appropriate?"

---

## FINAL: Double Review-Fix Cycle

### R1 — Architecture Review

**Prompt:** "Architecture review of searchDatabase implementation. Read these files in order:
1. `docs/features/chat/tools/layer-4-competition/5-search-database-tool.md` (feature doc)
2. `docs/features/chat/tools/layer-4-competition/search-database-tasks.md` (Key Decisions)
3. `functions/src/embedding/queryEmbedding.ts`
4. `functions/src/services/tools/handlers/competition/searchDatabase.ts`
5. `functions/src/services/tools/definitions.ts` (searchDatabase entry)
6. `functions/src/services/tools/executor.ts` (registration)

Check:
1. Does `generateQueryEmbedding` use `taskType: RETRIEVAL_QUERY`? Is `generatePackagingEmbedding` untouched?
2. Does handler follow the same patterns as `findSimilarVideos` (error handling, enrichment, progress reporting)?
3. Are all shared utilities imported correctly (`.js` extensions for ESM)?
4. Is `relevanceScore` in [0, 1] range with 3 decimal precision?
5. Does `channelIds` filter correctly intersect with user's trend channels?
6. Is coverage packaging-only (not visual)?
7. Does tool description help LLM correctly choose between `searchDatabase`, `findSimilarVideos`, and `browseTrendVideos`?
8. Are there any circular dependencies or unused imports?
9. Is `totalFound` semantics consistent with feature doc (after hidden filter, before truncation)?"

Fix all findings before R2.

### R2 — Production Readiness Review

**Prompt:** "Production readiness review of searchDatabase. Check:
1. All test suites pass: `npx vitest run --project frontend && npx vitest run --project functions`
2. Lint + typecheck: `npm run check`
3. No hardcoded API keys, secrets, or user IDs
4. Error messages are user-friendly (no stack traces leaked to LLM)
5. Handler is defensive: validates all inputs, handles null/undefined gracefully
6. No `console.log` in production code (use `logger` from `firebase-functions/v2`)
7. Imports use `.js` extension (ESM requirement for Cloud Functions)
8. Feature doc is up-to-date with implementation
9. Task doc checkboxes and test counts are current
10. All doc links resolve (`npm run check` includes link checker)"

Fix all findings. Then:
```bash
npx vitest run --project frontend
npx vitest run --project functions
npm run check
```

Record final test count in "Current Test Count" section.

**MANDATORY: Update this file:**
- [x] Phase Status table: FINAL → DONE
- [x] Record final test count
