# Codebase Infrastructure Scout - Memory

## Tool System Architecture (AI Chat)
- **Tool definitions**: `functions/src/services/tools/definitions.ts` — TOOL_NAMES const + FunctionDeclaration array
- **Tool executor**: `functions/src/services/tools/executor.ts` — HANDLERS map dispatches to handler functions
- **Tool types**: `functions/src/services/tools/types.ts` — ToolContext{userId,channelId}, ToolHandler signature
- **Handlers dir**: `functions/src/services/tools/handlers/` — one file per tool
- **Barrel export**: `functions/src/services/tools/index.ts`
- Adding a tool: 1) TOOL_NAMES 2) FunctionDeclaration 3) handler file 4) register in executor HANDLERS

## SSE Pipeline
- **Server writer**: `functions/src/chat/sseWriter.ts` — writeSSE() with SSEEvent union (mirror of client types)
- **Client parser**: `src/core/types/sseEvents.ts` — parseSSEEvent(), SSEEvent discriminated union
- **Client SSE reader**: `src/core/services/aiProxyService.ts` — streamChat() reads SSE stream
- **Chat store**: `src/core/stores/chatStore.ts` — onToolCall/onToolResult update activeToolCalls[]
- **AI service facade**: `src/core/services/aiService.ts` — delegates to aiProxyService
- SSE event types: chunk, toolCall, toolResult, thought, done, error (NO toolProgress yet)

## Frontend Tool UI
- **ToolCallBadge**: `src/features/Chat/components/ToolCallBadge.tsx` — TOOL_LABELS dict, per-record pill
- **ToolCallSummary**: `src/features/Chat/components/ToolCallSummary.tsx` — grouped consolidated pills
- **toolCallGrouping**: `src/features/Chat/utils/toolCallGrouping.ts` — groupToolCalls(), getGroupLabel()

## Traffic Types
- **Suggested Traffic (individual videos)**: `src/core/types/traffic.ts` — TrafficSource, TrafficSnapshot
- **Traffic Sources (aggregate metrics)**: `src/core/types/trafficSource.ts` — TrafficSourceMetric, TrafficSourceSnapshot
- **Delta calculator**: `src/core/utils/trafficSource/delta.ts` — calculateDelta(), calculateTotalDelta()
- **CSV parser (browser)**: `src/pages/Details/tabs/Traffic/utils/csvParser.ts` — uses FileReader (browser-only)
- **CSV utils (portable)**: `src/core/utils/csvUtils.ts` — parseCsvLine(), detectColumnMapping(), cleanCsvField()

## Conventions
- Handler signature: `(args: Record<string, unknown>, ctx: ToolContext) => Promise<Record<string, unknown>>`
- Firestore paths: `users/${userId}/channels/${channelId}/...`
- Existing collections searched by tools: `videos/`, `cached_suggested_traffic_videos/`
- Tool results flow: onToolCall SSE -> activeToolCalls[] (no result) -> onToolResult SSE -> match by name, set result
