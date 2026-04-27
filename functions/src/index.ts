/**
 * index.ts — Cloud Functions entry point (thin re-exports only).
 *
 * Each function lives in its own module for single responsibility.
 * Firebase CLI discovers exports from this file automatically.
 */

// ─── Trends ────────────────────────────────────────────────────────────
export { scheduledTrendSnapshot } from "./trends/scheduledSync.js";
export { manualTrendSync } from "./trends/manualSync.js";

// ─── Video Render ──────────────────────────────────────────────────────
export { startRender } from "./render/startRender.js";
export { cancelRender } from "./render/cancelRender.js";
export { deleteRender } from "./render/deleteRender.js";

// ─── AI Chat ───────────────────────────────────────────────────────────
export { aiChat } from "./chat/aiChat.js";
export { geminiUpload } from "./chat/geminiUpload.js";
export { generateChatTitle } from "./chat/generateChatTitle.js";
export { consolidateMemories } from "./chat/consolidation/consolidateMemories.js";

// ─── Firestore Triggers ────────────────────────────────────────────────
export { onConversationDeleted } from "./triggers/onConversationDeleted.js";
export { onProjectDeleted } from "./triggers/onProjectDeleted.js";
export { onKnowledgeItemDeleted } from "./triggers/onKnowledgeItemDeleted.js";

// ─── Embedding Sync ───────────────────────────────────────────────────
export { scheduledEmbeddingSync } from "./embedding/scheduledEmbeddingSync.js";
export { embeddingSyncBatch } from "./embedding/embeddingSyncBatch.js";
export { backfillEmbeddings } from "./embedding/backfillEmbeddings.js";

// ─── Audio Processing ──────────────────────────────────────────────────
export { trimAudioFile } from "./audio/trimAudioFile.js";

// ─── Video Management ──────────────────────────────────────────────────
export { moveVideoToChannel } from "./video/moveVideo.js";

// ─── Music Management ──────────────────────────────────────────────────
export { moveTrackToChannel } from "./music/moveTrack.js";
