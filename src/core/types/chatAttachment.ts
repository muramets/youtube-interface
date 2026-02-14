// =============================================================================
// Chat Attachment Types — Eager Upload
// =============================================================================

/**
 * Represents a file in the staging area with its upload status.
 * Files start uploading immediately when attached.
 */
export interface StagedFile {
    id: string;
    file: File;
    status: 'uploading' | 'ready' | 'error';
    error?: string;
    result?: ReadyAttachment;
}

/**
 * Upload result for a successfully staged file.
 * Ready to be saved as part of a chat message.
 */
export interface ReadyAttachment {
    type: 'image' | 'audio' | 'video' | 'file';
    url: string;
    storagePath: string;
    name: string;
    mimeType: string;
    geminiFileUri: string;
    geminiFileExpiry: number;
}
