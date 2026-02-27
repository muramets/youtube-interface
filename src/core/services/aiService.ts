// =============================================================================
// AI CHAT: AI Service — Client-side facade
// Delegates all Gemini API calls to Cloud Functions via aiProxyService.
// Retains only file validation utilities.
// =============================================================================

import type { ChatAttachment } from '../types/chat';
import { DEFAULT_MODEL } from '../types/chat';
import * as AiProxy from './aiProxyService';

// --- File validation utilities (client-side only) ---

/**
 * Determine attachment type from MIME type.
 */
export function getAttachmentType(mimeType: string): ChatAttachment['type'] {
    if (mimeType.startsWith('image/')) return 'image';
    if (mimeType.startsWith('audio/')) return 'audio';
    if (mimeType.startsWith('video/')) return 'video';
    return 'file';
}

/** Max file size per attachment type (bytes). */
const FILE_SIZE_LIMITS: Record<ChatAttachment['type'], number> = {
    image: 40 * 1024 * 1024,   // 40 MB
    audio: 100 * 1024 * 1024,  // 100 MB
    video: 200 * 1024 * 1024,  // 200 MB
    file: 50 * 1024 * 1024,   // 50 MB
};

/** Human-readable size limit per type. */
const FILE_SIZE_LABELS: Record<ChatAttachment['type'], string> = {
    image: '40 MB', audio: '100 MB', video: '200 MB', file: '50 MB',
};

/** Check if a file is within size limits for its type. */
export function isFileWithinLimit(file: File): boolean {
    const type = getAttachmentType(file.type);
    return file.size <= FILE_SIZE_LIMITS[type];
}

/** Get max size label for a file. */
export function getFileSizeLabel(file: File): string {
    return FILE_SIZE_LABELS[getAttachmentType(file.type)];
}

/** Check if a file has an allowed MIME type for the chat. */
export function isAllowedMimeType(file: File): boolean {
    return file.type.startsWith('image/') ||
        file.type.startsWith('audio/') ||
        file.type.startsWith('video/') ||
        file.type === 'application/pdf' ||
        file.type.startsWith('text/');
}

// --- Types ---

export type AiSendResult = {
    text: string;
    tokenUsage?: {
        promptTokens: number;
        completionTokens: number;
        totalTokens: number;
    };
    summary?: string;
    usedSummary?: boolean;
};

// --- Service (delegates to Cloud Functions) ---

export const AiService = {
    /**
     * Upload file to Gemini via Cloud Function.
     * @param storagePath Firebase Storage path (e.g. "chatAttachments/userId/filename.png")
     * @param mimeType MIME type of the file
     * @param displayName Human-readable file name
     */
    async uploadToGemini(
        storagePath: string,
        mimeType: string,
        displayName?: string
    ): Promise<{ uri: string; expiryMs: number }> {
        return AiProxy.uploadToGemini(storagePath, mimeType, displayName || 'attachment');
    },

    /**
     * Send a message to Gemini via Cloud Function (SSE streaming).
     * API key is handled server-side — not needed from client.
     */
    async sendMessage(opts: {
        channelId: string;
        conversationId: string;
        model?: string;
        systemPrompt?: string;
        text: string;
        attachments?: Array<{ geminiFileUri: string; mimeType: string }>;
        thumbnailUrls?: string[];
        contextMeta?: { videoCards?: number; trafficSources?: number; canvasNodes?: number; totalItems?: number };
        onStream?: (chunk: string) => void;
        signal?: AbortSignal;
    }): Promise<AiSendResult> {
        return AiProxy.streamChat({
            channelId: opts.channelId,
            conversationId: opts.conversationId,
            model: opts.model || DEFAULT_MODEL,
            systemPrompt: opts.systemPrompt,
            text: opts.text,
            attachments: opts.attachments,
            thumbnailUrls: opts.thumbnailUrls,
            contextMeta: opts.contextMeta,
            onStream: opts.onStream || (() => { }),
            signal: opts.signal,
        });
    },

    /**
     * Generate a short title for a conversation via Cloud Function.
     */
    async generateTitle(firstMessage: string, model?: string): Promise<string> {
        return AiProxy.generateChatTitle(firstMessage, model);
    },
};
