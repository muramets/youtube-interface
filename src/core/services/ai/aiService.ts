// =============================================================================
// AI CHAT: AI Service — Client-side facade
// Delegates all AI API calls to Cloud Functions via aiProxyService.
// Retains only file validation utilities.
// =============================================================================

import type { ChatAttachment, AiChatResult } from '../../types/chat/chat';
import { DEFAULT_MODEL } from '../../types/chat/chat';
import type { AttachmentSupport } from '../../../../shared/models';
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

/** Check if a file is supported by a specific model's attachment capabilities. */
export function isAllowedMimeTypeForModel(file: File, support: AttachmentSupport): boolean {
    if (file.type.startsWith('image/')) return support.image;
    if (file.type === 'application/pdf') return support.pdf;
    if (file.type.startsWith('audio/')) return support.audio;
    if (file.type.startsWith('video/')) return support.video;
    if (file.type.startsWith('text/')) return support.text;
    return false;
}

// --- Types ---

export type AiSendResult = AiChatResult;

// --- Service (delegates to Cloud Functions) ---

export const AiService = {
    /**
     * Upload file to AI provider via Cloud Function.
     * @param storagePath Firebase Storage path (e.g. "chatAttachments/userId/filename.png")
     * @param mimeType MIME type of the file
     * @param displayName Human-readable file name
     */
    async uploadFile(
        storagePath: string,
        mimeType: string,
        displayName?: string
    ): Promise<{ uri: string; expiryMs: number }> {
        return AiProxy.uploadFile(storagePath, mimeType, displayName || 'attachment');
    },

    /**
     * Send a message to AI via Cloud Function (SSE streaming).
     * API key is handled server-side — not needed from client.
     */
    async sendMessage(opts: {
        channelId: string;
        conversationId: string;
        model?: string;
        systemPrompt?: string;
        systemLayers?: { settings: number; persistentContext: number; crossMemory: number };
        text: string;
        attachments?: Array<{ type: string; url: string; name: string; mimeType: string; fileRef?: string }>;
        thumbnailUrls?: string[];
        contextMeta?: { videoCards?: number; trafficSources?: number; canvasNodes?: number; totalItems?: number };
        onStream?: (chunk: string) => void;
        onToolCallStart?: (name: string, toolCallIndex: number) => void;
        onToolCall?: (name: string, args: Record<string, unknown>, toolCallIndex: number) => void;
        onToolResult?: (name: string, result: Record<string, unknown>, toolCallIndex: number) => void;
        onToolProgress?: (toolName: string, message: string, toolCallIndex: number) => void;
        onThought?: (text: string) => void;
        onConfirmLargePayload?: (count: number) => void;
        onRetry?: (attempt: number) => void;
        thinkingOptionId?: string;
        largePayloadApproved?: boolean;
        signal?: AbortSignal;
        isConclude?: boolean;
    }): Promise<AiSendResult> {
        return AiProxy.streamChat({
            channelId: opts.channelId,
            conversationId: opts.conversationId,
            model: opts.model || DEFAULT_MODEL,
            systemPrompt: opts.systemPrompt,
            systemLayers: opts.systemLayers,
            text: opts.text,
            attachments: opts.attachments,
            thumbnailUrls: opts.thumbnailUrls,
            contextMeta: opts.contextMeta,
            onStream: opts.onStream || (() => { }),
            onToolCallStart: opts.onToolCallStart,
            onToolCall: opts.onToolCall,
            onToolResult: opts.onToolResult,
            onToolProgress: opts.onToolProgress,
            onThought: opts.onThought,
            onConfirmLargePayload: opts.onConfirmLargePayload,
            onRetry: opts.onRetry,
            thinkingOptionId: opts.thinkingOptionId,
            largePayloadApproved: opts.largePayloadApproved,
            signal: opts.signal,
            isConclude: opts.isConclude,
        });
    },

    /**
     * Generate a short title for a conversation via Cloud Function.
     */
    async generateTitle(firstMessage: string, model?: string, channelId?: string, conversationId?: string): Promise<string> {
        return AiProxy.generateChatTitle(firstMessage, model, channelId, conversationId);
    },
};
