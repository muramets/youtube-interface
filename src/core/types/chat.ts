// =============================================================================
// AI CHAT: Type Definitions
// =============================================================================

import { Timestamp } from 'firebase/firestore';
import type { AppContextItem } from './appContext';

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
    geminiFileUri?: string;   // Gemini File API URI (e.g., "files/abc123")
    geminiFileExpiry?: number; // Expiration timestamp (ms since epoch)
}

export interface ChatMessage {
    id: string;
    role: 'user' | 'model';
    text: string;
    attachments?: ChatAttachment[];
    appContext?: AppContextItem[]; // Video card / page context snapshot at send time
    tokenUsage?: {
        promptTokens: number;
        completionTokens: number;
        totalTokens: number;
    };
    createdAt: Timestamp;
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

export type { ModelConfig } from '../../../shared/models';
export { MODEL_REGISTRY } from '../../../shared/models';
import { MODEL_REGISTRY } from '../../../shared/models';

export const DEFAULT_MODEL = MODEL_REGISTRY.find(m => m.isDefault)?.id ?? MODEL_REGISTRY[0].id;
export const DEFAULT_CONTEXT_LIMIT = 1_000_000;

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
