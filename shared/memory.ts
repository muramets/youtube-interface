// =============================================================================
// shared/memory.ts — Shared types for L4 cross-conversation memory
//
// Zero dependencies. Used by both frontend (types, UI) and backend (Firestore).
// =============================================================================

/**
 * Custom videos without successful YouTube fetch have placeholder 1M viewCount.
 * This guard prevents fake metrics from leaking into tooltips, KI snapshots, and LLM tools.
 */
export function hasRealVideoData(video: { isCustom?: boolean; fetchStatus?: string }): boolean {
    return !video.isCustom || video.fetchStatus === 'success'
}

/** Video snapshot attached to a Layer 4 memory. */
export interface MemoryVideoRef {
    videoId: string;
    title: string;
    ownership: 'own-published' | 'own-draft' | 'competitor';
    thumbnailUrl: string;
    viewCount?: number;
    publishedAt?: string;
}
