// =============================================================================
// AI CHAT: Firestore Service
// =============================================================================

import { Timestamp, orderBy, limitToLast, endBefore, writeBatch, doc as firestoreDoc } from 'firebase/firestore';
import { v4 as uuidv4 } from 'uuid';
import {
    fetchCollection,
    setDocument,
    updateDocument,
    deleteDocument,
    subscribeToCollection,
    fetchDoc,
    subscribeToDoc,
} from './firestore';
import { db } from '../../config/firebase';

import type {
    ChatProject,
    ChatConversation,
    ChatMessage,
    AiAssistantSettings,
} from '../types/chat';
import { DEFAULT_AI_SETTINGS } from '../types/chat';

// --- Path Helpers ---

const projectsPath = (userId: string, channelId: string) =>
    `users/${userId}/channels/${channelId}/chatProjects`;

const conversationsPath = (userId: string, channelId: string) =>
    `users/${userId}/channels/${channelId}/chatConversations`;

const messagesPath = (userId: string, channelId: string, conversationId: string) =>
    `users/${userId}/channels/${channelId}/chatConversations/${conversationId}/messages`;

const settingsPath = (userId: string, channelId: string) =>
    `users/${userId}/channels/${channelId}/settings`;

export const MESSAGE_PAGE_SIZE = 50;
export const CONVERSATION_PAGE_SIZE = 30;

// --- Projects ---

export const ChatService = {
    // Projects
    async getProjects(userId: string, channelId: string): Promise<ChatProject[]> {
        return fetchCollection<ChatProject>(projectsPath(userId, channelId), [orderBy('order', 'asc')]);
    },

    subscribeToProjects(
        userId: string,
        channelId: string,
        callback: (projects: ChatProject[]) => void
    ) {
        return subscribeToCollection<ChatProject>(
            projectsPath(userId, channelId),
            callback,
            [orderBy('order', 'asc')]
        );
    },

    async createProject(userId: string, channelId: string, name: string, order: number): Promise<ChatProject> {
        const id = uuidv4();
        const now = Timestamp.now();
        const project: Omit<ChatProject, 'id'> = {
            name,
            order,
            createdAt: now,
            updatedAt: now,
        };
        await setDocument(projectsPath(userId, channelId), id, project);
        return { ...project, id };
    },

    async updateProject(
        userId: string,
        channelId: string,
        projectId: string,
        updates: Partial<Pick<ChatProject, 'name' | 'systemPrompt' | 'model' | 'order'>>
    ) {
        await updateDocument(projectsPath(userId, channelId), projectId, {
            ...updates,
            updatedAt: Timestamp.now(),
        });
    },

    async deleteProject(userId: string, channelId: string, projectId: string) {
        // Just delete the project document — cascading cleanup (conversations + messages + storage)
        // is handled server-side by the onProjectDeleted Firestore trigger
        await deleteDocument(projectsPath(userId, channelId), projectId);
    },

    // Conversations
    async getConversations(userId: string, channelId: string): Promise<ChatConversation[]> {
        return fetchCollection<ChatConversation>(
            conversationsPath(userId, channelId),
            [orderBy('updatedAt', 'desc')]
        );
    },

    subscribeToConversations(
        userId: string,
        channelId: string,
        callback: (conversations: ChatConversation[]) => void
    ) {
        return subscribeToCollection<ChatConversation>(
            conversationsPath(userId, channelId),
            callback,
            [orderBy('updatedAt', 'asc'), limitToLast(CONVERSATION_PAGE_SIZE)]
        );
    },

    async getOlderConversations(
        userId: string,
        channelId: string,
        beforeTimestamp: Timestamp,
        count: number = CONVERSATION_PAGE_SIZE
    ): Promise<ChatConversation[]> {
        return fetchCollection<ChatConversation>(
            conversationsPath(userId, channelId),
            [orderBy('updatedAt', 'asc'), endBefore(beforeTimestamp), limitToLast(count)]
        );
    },

    async createConversation(
        userId: string,
        channelId: string,
        projectId: string | null,
        title: string = 'New Chat'
    ): Promise<ChatConversation> {
        const id = uuidv4();
        const now = Timestamp.now();
        const conversation: Omit<ChatConversation, 'id'> = {
            projectId,
            title,
            createdAt: now,
            updatedAt: now,
        };
        await setDocument(conversationsPath(userId, channelId), id, conversation);
        return { ...conversation, id };
    },

    async updateConversation(
        userId: string,
        channelId: string,
        conversationId: string,
        updates: Partial<Pick<ChatConversation, 'title' | 'projectId'>>
    ) {
        await updateDocument(conversationsPath(userId, channelId), conversationId, {
            ...updates,
            updatedAt: Timestamp.now(),
        });
    },

    async deleteConversation(userId: string, channelId: string, conversationId: string) {
        // Just delete the conversation document — cascading cleanup (messages + storage)
        // is handled server-side by the onConversationDeleted Firestore trigger
        await deleteDocument(conversationsPath(userId, channelId), conversationId);
    },

    // Messages
    subscribeToMessages(
        userId: string,
        channelId: string,
        conversationId: string,
        callback: (messages: ChatMessage[]) => void
    ) {
        return subscribeToCollection<ChatMessage>(
            messagesPath(userId, channelId, conversationId),
            callback,
            [orderBy('createdAt', 'asc'), limitToLast(MESSAGE_PAGE_SIZE)]
        );
    },

    async getOlderMessages(
        userId: string,
        channelId: string,
        conversationId: string,
        beforeTimestamp: Timestamp,
        count: number = MESSAGE_PAGE_SIZE
    ): Promise<ChatMessage[]> {
        return fetchCollection<ChatMessage>(
            messagesPath(userId, channelId, conversationId),
            [orderBy('createdAt', 'asc'), endBefore(beforeTimestamp), limitToLast(count)]
        );
    },

    async addMessage(
        userId: string,
        channelId: string,
        conversationId: string,
        message: Omit<ChatMessage, 'id' | 'createdAt'>,
        /** Extra conversation updates to batch with the message write (e.g. title) */
        conversationUpdates?: Partial<Pick<ChatConversation, 'title'>>
    ): Promise<ChatMessage> {
        const id = uuidv4();
        const now = Timestamp.now();
        const msg: Omit<ChatMessage, 'id'> = {
            ...message,
            createdAt: now,
        };

        // Single atomic batch: message + conversation touch (+ optional title)
        const batch = writeBatch(db);
        const msgRef = firestoreDoc(db, messagesPath(userId, channelId, conversationId), id);
        const convRef = firestoreDoc(db, conversationsPath(userId, channelId), conversationId);

        batch.set(msgRef, msg);
        batch.update(convRef, { updatedAt: now, ...conversationUpdates });
        await batch.commit();

        return { ...msg, id };
    },

    async updateMessage(
        userId: string,
        channelId: string,
        conversationId: string,
        messageId: string,
        updates: Partial<Pick<ChatMessage, 'attachments'>>
    ) {
        await updateDocument(messagesPath(userId, channelId, conversationId), messageId, updates);
    },

    // AI Settings
    async getAiSettings(userId: string, channelId: string): Promise<AiAssistantSettings> {
        const settings = await fetchDoc<AiAssistantSettings>(settingsPath(userId, channelId), 'aiAssistant');
        return settings ?? DEFAULT_AI_SETTINGS;
    },

    subscribeToAiSettings(
        userId: string,
        channelId: string,
        callback: (settings: AiAssistantSettings) => void
    ) {
        return subscribeToDoc<AiAssistantSettings>(
            settingsPath(userId, channelId),
            'aiAssistant',
            (data) => callback(data ?? DEFAULT_AI_SETTINGS)
        );
    },

    async saveAiSettings(
        userId: string,
        channelId: string,
        settings: Partial<AiAssistantSettings>
    ) {
        await setDocument(settingsPath(userId, channelId), 'aiAssistant', settings, true);
    },
};
