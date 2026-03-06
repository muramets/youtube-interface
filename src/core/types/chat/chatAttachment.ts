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
    /** Image width in pixels (captured via Image.onload at staging time). */
    width?: number;
    /** Image height in pixels (captured via Image.onload at staging time). */
    height?: number;
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
    fileRef?: string;
    fileRefExpiry?: number;
    /** Image width in pixels (for token estimation). */
    width?: number;
    /** Image height in pixels (for token estimation). */
    height?: number;
}
