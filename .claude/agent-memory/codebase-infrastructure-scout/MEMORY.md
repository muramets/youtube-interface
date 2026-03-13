# Codebase Infrastructure Scout - Memory

## Infrastructure Maps
- [notes-insights-infrastructure.md](./notes-insights-infrastructure.md) — All note, insight, and memory systems: VideoNote, TrafficNote, Canvas Insights, Chat L4 Memory, Save-from-Chat

## Tool System Architecture (AI Chat) — VERIFIED 2026-03-09

### Adding a New Tool (4-step checklist)
1. `functions/src/services/tools/definitions.ts` — add to `TOOL_NAMES` const + create `ToolDefinition` object + add to `TOOL_DECLARATIONS` array
2. `functions/src/services/tools/handlers/newTool.ts` — implement handler with `ToolHandler` signature
3. `functions/src/services/tools/executor.ts` — import handler + add to `HANDLERS` map
4. `src/features/Chat/utils/toolCallGrouping.ts` — add `getGroupLabel()` case + `extractVideoIds` if applicable + `isExpandable()` case

### Optional frontend touches (nice-to-have)
- `src/features/Chat/components/ToolCallBadge.tsx` — add to `TOOL_LABELS` dict (pending/resolved strings)

### Core Files
- **Definitions**: `functions/src/services/tools/definitions.ts` — `TOOL_NAMES` (const object), `ToolName` (type), `TOOL_DECLARATIONS` (ToolDefinition[])
- **Executor**: `functions/src/services/tools/executor.ts` — `HANDLERS: Record<ToolName, ToolHandler>`, `executeTool()` dispatcher
- **Types**: `functions/src/services/tools/types.ts` — `ToolContext{userId, channelId, youtubeApiKey?, reportProgress?}`, `ToolHandler` signature, `FunctionCallInput`, `FunctionCallResult`
- **Barrel export**: `functions/src/services/tools/index.ts`
- **Tool adapter (Gemini)**: `functions/src/services/gemini/toolAdapter.ts` — `toFunctionDeclarations()` — 1:1 mapping, automatic
- **AI types**: `functions/src/services/ai/types.ts` — `ToolDefinition{name, description, parametersJsonSchema}`, `AiProvider`, `ProviderStreamOpts`
- **Tool execution**: `functions/src/services/ai/toolExecution.ts` — `executeToolBatch()`, parallel execution + SSE callbacks

### Handler Signature
```typescript
export async function handleXxx(
    args: Record<string, unknown>,
    ctx: ToolContext,
): Promise<Record<string, unknown>> { ... }
```

### Handler Patterns (established)
- Args validation at top, return `{ error: "message" }` for bad input (never throw)
- `ctx.reportProgress?.("message...")` for mid-execution SSE progress updates
- Firestore base path: `const basePath = \`users/\${ctx.userId}/channels/\${ctx.channelId}\``
- `resolveVideosByIds(basePath, ids)` for video lookup (2-step: direct + publishedVideoId reverse)
- `getViewDeltas(userId, channelId, videoIds, channelIdHints?)` for enriching with 24h/7d/30d deltas
- `getHiddenVideoIds(basePath)` for filtering hidden videos (Layer 4 tools)
- `normalizeLastUpdated(value)` for Firestore timestamp normalization
- `YouTubeService(ctx.youtubeApiKey)` for YouTube API calls (check `ctx.youtubeApiKey` first)
- Wrap entire handler body in try/catch, return `{ error: msg }` on catch
- `_systemNote` field for LLM-only instructions (e.g. QUOTA_GATE)

### Existing Tools (11 total, by layer)
- **Layer 1 Discovery**: `getChannelOverview` (YouTube API), `browseChannelVideos` (YouTube API + Firestore cache)
- **Layer 2 Detail**: `getMultipleVideoDetails` (Firestore cascade + YouTube fallback), `viewThumbnails` (Firestore lookup, returns visualContextUrls)
- **Layer 3 Analysis**: `analyzeTrafficSources` (Cloud Storage CSV + Firestore), `analyzeSuggestedTraffic` (Cloud Storage CSV + Firestore)
- **Layer 4 Competition**: `listTrendChannels` (Firestore-only), `browseTrendVideos` (Firestore + percentiles + deltas), `getNicheSnapshot` (Firestore + window), `findSimilarVideos` (embedding vector search)
- **Utility**: `mentionVideo` (Firestore lookup)

### Shared Utilities
- `functions/src/services/tools/utils/resolveVideos.ts` — `resolveVideosByIds()`, handles custom video IDs
- `functions/src/services/tools/utils/getHiddenVideoIds.ts` — reads `hiddenVideos/` subcollection
- `functions/src/services/tools/utils/normalizeLastUpdated.ts` — Firestore timestamp normalization
- `functions/src/services/trendSnapshotService.ts` — `getViewDeltas()`, `getTrendSnapshots()`
- `shared/percentiles.ts` — `assignPercentileGroups()` — used by Layer 4 tools
- `shared/viewDeltas.ts` — `calculateViewDeltas()` — SSOT algorithm

### Firestore Collections Used by Tools
- `users/{uid}/channels/{chId}/videos/` — own videos
- `users/{uid}/channels/{chId}/cached_external_videos/` — external cache (source field: suggested_traffic | channel_discovery | api_fallback)
- `users/{uid}/channels/{chId}/trendChannels/` — tracked competitor channels
- `users/{uid}/channels/{chId}/trendChannels/{tcId}/videos/` — competitor videos
- `users/{uid}/channels/{chId}/trendChannels/{tcId}/snapshots/` — view count snapshots (for deltas)
- `users/{uid}/channels/{chId}/hiddenVideos/` — user-hidden videos
- `users/{uid}/channels/{chId}/videos/{vId}/traffic/main` — suggested traffic CSV metadata
- `users/{uid}/channels/{chId}/videos/{vId}/trafficSource/main` — traffic source CSV metadata
- `globalVideoEmbeddings/` — content-addressable embedding docs (shared between users)
- `system/embeddingStats` — embedding coverage stats
- `system/embeddingBudget` — budget tracking

## SSE Pipeline
- **Server writer**: `functions/src/chat/sseWriter.ts` — `writeSSE()` with SSEEvent union (mirror of client types)
- **Client parser**: `src/core/types/sseEvents.ts` — `parseSSEEvent()`, SSEEvent discriminated union
- SSE event types: chunk, toolCall, toolResult, thought, toolProgress, done, error, confirmLargePayload, retry

## Frontend Tool UI
- **ToolCallBadge**: `src/features/Chat/components/ToolCallBadge.tsx` — `TOOL_LABELS` dict (only 3 tools have custom labels), per-record pill
- **ToolCallSummary**: `src/features/Chat/components/ToolCallSummary.tsx` — grouped consolidated pills
- **toolCallGrouping**: `src/features/Chat/utils/toolCallGrouping.ts` — `groupToolCalls()`, `getGroupLabel()`, `isExpandable()`, `extractVideoIdsForTool()`

## Testing Pattern (tool handlers)
- Vitest + vi.mock for dependencies (youtube.js, shared/db.js)
- `const CTX: ToolContext = { userId: "user1", channelId: "ch1", youtubeApiKey: "test-key" }`
- Test categories: args validation, error handling, successful responses, progress reporting, quota calculation
- Mock Firestore via vi.mock("../../../shared/db.js")
- One test file per handler: `handlers/__tests__/handlerName.test.ts`

## External Services Used by Tools
- **YouTube Data API** (`functions/src/services/youtube.ts`): `YouTubeService` class, methods: `getPlaylistVideos`, `getVideoDetails`, `getChannelInfo`, `resolveChannelId`, `getChannelAvatar`
- **Cloud Storage** (`admin.storage().bucket()`): for downloading CSV files (traffic analysis)
- **Embedding pipeline** (`functions/src/embedding/`): `generatePackagingEmbedding`, `generateVisualEmbedding`, `findNearestVideos`, `rrfMerge`

## Conventions
- Firestore paths: `users/${userId}/channels/${channelId}/...`
- Thumbnail field in Firestore: `thumbnail` (NOT `thumbnailUrl`)
- Tool results flow: onToolCall SSE -> activeToolCalls[] (no result) -> onToolResult SSE -> match by name, set result
- YouTube API key comes from user settings, passed via ToolContext.youtubeApiKey
- ToolDefinition uses `parametersJsonSchema` (JSON Schema format), auto-converts to Gemini/Claude formats

## Documentation
- Tool docs live in `docs/features/chat/tools/` organized by layer
- Master index: `docs/features/chat/tools/README.md` — Telescope Pattern diagram, Tool Index table, User Flows
