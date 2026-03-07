// =============================================================================
// shared/memory.ts — Shared types for L4 cross-conversation memory
//
// Zero dependencies. Used by both frontend (types, UI) and backend (Firestore).
// =============================================================================

/** Video snapshot attached to a Layer 4 memory. */
export interface MemoryVideoRef {
    videoId: string;
    title: string;
    ownership: 'own-published' | 'own-draft' | 'competitor';
    thumbnailUrl: string;
}
