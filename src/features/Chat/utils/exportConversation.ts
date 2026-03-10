import { ChatService } from '../../../core/services/ai/chatService';
import type { ChatConversation, ChatMessage } from '../../../core/types/chat/chat';
import type { Timestamp } from 'firebase/firestore';

// --- Serialization helpers ---

/** Convert Firestore Timestamp to ISO string for JSON export */
function serializeTimestamp(ts: Timestamp | undefined): string | null {
    if (!ts || typeof ts.toDate !== 'function') return null;
    return ts.toDate().toISOString();
}

/** Strip Firestore-specific fields and convert timestamps for clean JSON */
function serializeMessage(msg: ChatMessage) {
    return {
        id: msg.id,
        role: msg.role,
        text: msg.text,
        model: msg.model,
        status: msg.status,
        attachments: msg.attachments,
        appContext: msg.appContext,
        thinking: msg.thinking,
        thinkingElapsedMs: msg.thinkingElapsedMs,
        toolCalls: msg.toolCalls,
        tokenUsage: msg.tokenUsage,
        normalizedUsage: msg.normalizedUsage,
        contextBreakdown: msg.contextBreakdown,
        overrides: msg.overrides,
        createdAt: serializeTimestamp(msg.createdAt),
    };
}

// --- Export types ---

export interface ConversationTrace {
    meta: {
        conversationId: string;
        title: string;
        projectId: string | null;
        model: string | undefined;
        exportedAt: string;
        messageCount: number;
        totalToolCalls: number;
    };
    conversation: {
        summary: string | undefined;
        summarizedUpTo: string | undefined;
        persistedContext: ChatConversation['persistedContext'];
        createdAt: string | null;
        updatedAt: string | null;
    };
    messages: ReturnType<typeof serializeMessage>[];
}

// --- Core export function ---

export async function buildConversationTrace(
    userId: string,
    channelId: string,
    conversation: ChatConversation,
): Promise<ConversationTrace> {
    const messages = await ChatService.getAllMessages(userId, channelId, conversation.id);

    const totalToolCalls = messages.reduce(
        (sum: number, m: ChatMessage) => sum + (m.toolCalls?.length ?? 0), 0
    );

    return {
        meta: {
            conversationId: conversation.id,
            title: conversation.title,
            projectId: conversation.projectId ?? null,
            model: conversation.model,
            exportedAt: new Date().toISOString(),
            messageCount: messages.length,
            totalToolCalls,
        },
        conversation: {
            summary: conversation.summary,
            summarizedUpTo: conversation.summarizedUpTo,
            persistedContext: conversation.persistedContext,
            createdAt: serializeTimestamp(conversation.createdAt),
            updatedAt: serializeTimestamp(conversation.updatedAt),
        },
        messages: messages.map(serializeMessage),
    };
}

// --- Download trigger ---

export function downloadJson(data: ConversationTrace, filename: string): void {
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}
