// =============================================================================
// AI CHAT: Type Definitions
// =============================================================================

import { Timestamp } from 'firebase/firestore';
import type { AppContextItem } from '../appContext';
import type { ToolCallRecord } from '../sseEvents';

export type { ToolCallRecord } from '../sseEvents';

// --- Firestore Models ---

export interface ChatProject {
    id: string;
    name: string;
    systemPrompt?: string;
    model?: string;           // per-project model override
    createdAt: Timestamp;
    updatedAt: Timestamp;
    order: number;
}

export interface ChatConversation {
    id: string;
    projectId: string | null; // null = unassigned
    title: string;
    model?: string;              // per-conversation model override
    summary?: string;           // cached conversation summary
    summarizedUpTo?: string;    // ID of last message included in summary
    persistedContext?: AppContextItem[]; // Video/traffic/canvas context attached for the lifetime of this conversation
    lastError?: {               // explicit failure signal for recovery (server or client)
        messageId?: string;       // present for server-side failures
        error: string;
        failedText?: string;      // present for client-side write failures (text preserved for retry)
    } | null;
    createdAt: Timestamp;
    updatedAt: Timestamp;
}

export interface ChatAttachment {
    type: 'image' | 'audio' | 'video' | 'file';
    url: string;
    name: string;
    mimeType: string;
    fileRef?: string;          // AI provider file reference (e.g., Gemini "files/abc123")
    fileRefExpiry?: number;    // Expiration timestamp (ms since epoch)
}

/** Message status (immutable after write). */
export type MessageStatus = 'complete' | 'stopped' | 'deleted' | 'error';

export interface ChatMessage {
    id: string;
    role: 'user' | 'model';
    text: string;
    attachments?: ChatAttachment[];
    appContext?: AppContextItem[]; // Video card / page context snapshot at send time
    model?: string;               // Model used to generate this response (for accurate cost tracking)
    tokenUsage?: TokenUsage;
    normalizedUsage?: NormalizedTokenUsage;
    toolCalls?: ToolCallRecord[];   // Structured tool calls from agentic mode (Stage 5+)
    overrides?: Record<string, string>; // Tier 3: Manual overrides for hallucinated references (e.g. { "4": "competitor-4" })
    /** Immutable message status. undefined = legacy (always visible). */
    status?: MessageStatus;
    /** Context breakdown: char sizes of components sent to the model. */
    contextBreakdown?: import('../../../../shared/models').ContextBreakdown;
    createdAt: Timestamp;
}

/**
 * Pure render function: determines whether a message should be visible.
 * Status is written once and never mutated. Visibility computed at render time.
 */
export function shouldShowMessage(msg: ChatMessage, allMessages: ChatMessage[]): boolean {
    if (!msg.status || msg.status === 'complete') return true;
    if (msg.status === 'deleted' || msg.status === 'error') return false;
    if (msg.status === 'stopped') {
        // Stopped visible when it's the last model message (no newer complete model message)
        return !allMessages.some(m =>
            m.createdAt > msg.createdAt && m.role === 'model'
            && (!m.status || m.status === 'complete')
        );
    }
    return true;
}

/** Result of a streaming AI chat call (shared between proxy/service layers). */
export interface AiChatResult {
    text: string;
    tokenUsage?: TokenUsage;
    normalizedUsage?: NormalizedTokenUsage;
    toolCalls?: ToolCallRecord[];
    summary?: string;
    usedSummary?: boolean;
    contextBreakdown?: import('../../../../shared/models').ContextBreakdown;
    status?: 'complete' | 'stopped';
    partial?: boolean;
}

// Re-export shared type for consumers that import from chat types
export type { MemoryVideoRef } from '../../../../shared/memory';

/** Layer 4: A saved memory (insight) from a concluded conversation or manual note. */
export interface ConversationMemory {
    id: string;
    conversationId?: string;   // absent for manual memories
    conversationTitle: string;
    content: string;           // generated summary (user-editable)
    guidance?: string;         // optional user guidance for focus
    source?: 'chat' | 'manual'; // absent on legacy memories (treated as 'chat')
    videoRefs?: import('../../../../shared/memory').MemoryVideoRef[]; // video snapshots referenced by this insight
    createdAt: Timestamp;
    updatedAt: Timestamp;
}

export interface AiAssistantSettings {
    defaultModel: string;
    globalSystemPrompt: string;
    responseLanguage: string;
    responseStyle: string;
}

// --- UI State ---

export type ChatView = 'projects' | 'conversations' | 'chat';

// --- Model config (imported from shared SSOT) ---

export type { ModelConfig, ModelPricing, AttachmentSupport, TokenUsage, NormalizedTokenUsage, ContextBreakdown } from '../../../../shared/models';
export { MODEL_REGISTRY, HISTORY_BUDGET_RATIO, estimateCostUsd, estimateCacheSavingsUsd, resolveModelId, getAcceptedMimeTypes, type ThinkingOption } from '../../../../shared/models';
import { MODEL_REGISTRY, type TokenUsage, type NormalizedTokenUsage } from '../../../../shared/models';

export const DEFAULT_MODEL = MODEL_REGISTRY.find(m => m.isDefault)?.id ?? MODEL_REGISTRY[0].id;
export const DEFAULT_CONTEXT_LIMIT = (MODEL_REGISTRY.find(m => m.isDefault) ?? MODEL_REGISTRY[0]).contextLimit;

export const RESPONSE_LANGUAGES = [
    { id: 'auto', label: 'Auto (match user language)' },
    { id: 'en', label: 'English' },
    { id: 'ru', label: 'Русский' },
    { id: 'uk', label: 'Українська' },
    { id: 'es', label: 'Español' },
    { id: 'de', label: 'Deutsch' },
    { id: 'fr', label: 'Français' },
] as const;

export const RESPONSE_STYLES = [
    { id: 'concise', label: 'Concise', description: 'Short, to-the-point answers' },
    { id: 'balanced', label: 'Balanced', description: 'Default behavior' },
    { id: 'detailed', label: 'Detailed', description: 'Thorough explanations with examples' },
] as const;

export const DEFAULT_AI_SETTINGS: AiAssistantSettings = {
    defaultModel: DEFAULT_MODEL,
    globalSystemPrompt: '',
    responseLanguage: 'auto',
    responseStyle: 'balanced',
};
