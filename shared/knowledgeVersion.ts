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

    // — Origin provenance (copied from KI.source / KI.model) —

    /** How the KI was originally created */
    source: 'chat-tool' | 'conclude' | 'manual';
    /** Model that originally created the KI */
    model?: string;

    // — Edit provenance (copied from KI.lastEditSource / KI.lastEditedBy) —

    /** Who last edited this content before it was snapshot'd */
    lastEditSource?: 'chat-tool' | 'conclude' | 'manual' | 'chat-edit';
    /** Model that performed the last edit */
    lastEditedBy?: string;
}
