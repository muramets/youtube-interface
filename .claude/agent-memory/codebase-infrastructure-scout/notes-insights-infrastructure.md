---
name: notes-insights-infrastructure
description: Comprehensive map of all note, insight, and memory systems across the codebase — video notes, traffic notes, canvas insights, chat memory, save-from-chat
type: project
---

## Existing Note/Insight Systems (as of 2026-03-13)

### 1. Video Notes (Watch Page)
- **Type**: `VideoNote` in `src/core/utils/youtubeApi.ts` — `{ id, text, timestamp, userId?, source? }`
- **Storage**: `notes: VideoNote[]` array field on video doc (`users/{uid}/channels/{chId}/videos/{vId}`)
- **UI**: `src/features/Watch/components/WatchPageNotes.tsx` — full CRUD, markdown rendering for AI notes
- **Source tag**: `source: 'manual' | 'ai-chat'` — AI-originated notes show blue accent + Sparkles badge
- **Write path**: `useVideos().updateVideo({ videoId, updates: { notes: [...] } })`

### 2. Traffic Notes
- **Type**: `TrafficNote` in `src/core/types/suggestedTraffic/trafficNote.ts` — `{ videoId, text, updatedAt }`
- **Storage**: Dedicated Firestore collection `users/{uid}/channels/{chId}/traffic_notes/{videoId}`
- **Store**: `useTrafficNoteStore` (Zustand, optimistic updates)
- **Service**: `TrafficNoteService` — subscribe/set/delete
- **UI**: Inline note input on TrafficRow in Suggested Traffic table

### 3. Canvas Per-Node Insights
- **Type**: `NodeInsight { text, pinned? }` on `InsightCategory: 'packaging' | 'visual' | 'music'`
- **Storage**: `insights` field on `TrafficSourceCardData` (embedded in canvas node data)
- **UI**: `InsightButtons` (sparkle badge → 3 category popover), `InsightPopover` (editable textarea + pin toggle)
- **Global bar**: `GlobalInsightsBar` — shows all pinned insights as chips at canvas top
- **Write**: `canvasStore.updateNodeData(nodeId, { insights })`

### 4. Chat L4 Memory (Cross-Conversation)
- **Type**: `ConversationMemory` in `src/core/types/chat/chat.ts`
- **Storage**: `users/{uid}/channels/{chId}/conversationMemories/{memId}`
- **Service**: `ChatService.createMemory/updateMemory/deleteMemory/loadMemories`
- **Backend**: `functions/src/services/memory.ts` — `generateConcludeSummary()`
- **Endpoint**: `functions/src/chat/concludeConversation.ts`
- **UI**: `MemoryCheckpoint` (chat), `AiAssistantSettings` (settings)

### 5. Save from Chat (SelectionToolbar)
- **Files**: `src/features/Chat/components/SelectionToolbar.tsx`, `SaveTargetPopover.tsx`
- **Flow**: Select AI response text → Pin pill → choose destination → save
- **Save to Video**: Creates `VideoNote` with `source: 'ai-chat'`, appends to video.notes array
- **Save to Canvas**: Creates sticky-note node via `canvasStore.addNodeAt()` with blue color
- **Multi-select**: Cmd+select accumulates snippets, CSS Highlight API for visual feedback
- **HTML→Markdown**: Uses TurndownService to preserve formatting

**Why:** This inventory is needed when building any "video insights" feature — multiple existing systems need integration or deduplication.

**How to apply:** Before designing any new note/insight feature, consult this list to determine what to REUSE vs what to CREATE.
