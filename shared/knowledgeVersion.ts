// =============================================================================
// shared/knowledgeVersion.ts — Version snapshot type for Knowledge Items
//
// Zero dependencies. Used by both frontend (UI) and backend (Firestore).
// Stored in: users/{uid}/channels/{chId}/knowledgeItems/{kiId}/versions/{versionId}
// =============================================================================

/**
 * A snapshot of a Knowledge Item's content at a point in time.
 * Created whenever content is updated (via LLM tool or manual UI edit).
 */
export interface KnowledgeVersion {
    /** The content at the time of this version */
    content: string;
    /** Title snapshot — for diff labels (future: title editing) */
    title?: string;
    /** Unix timestamp (Date.now()) — NOT serverTimestamp (arrayUnion gotcha) */
    createdAt: number;
    /** How this version was created (includes 'chat-edit' for LLM-edited content) */
    source: 'chat-tool' | 'conclude' | 'manual' | 'chat-edit';
    /** Model that created this version (empty for manual edits) */
    model?: string;
}
