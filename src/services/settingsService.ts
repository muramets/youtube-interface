import {
    subscribeToDoc,
    setDocument,
} from './firestore';

export interface SyncSettings {
    autoSync: boolean;
    frequencyHours: number;
}

export interface CloneSettings {
    cloneDurationSeconds: number;
}

export interface GeneralSettings {
    cardsPerRow: number;
    hiddenPlaylistIds: string[];
    theme: 'light' | 'dark';
    apiKey?: string; // Now stored in Firestore
}

export interface RecommendationOrder {
    [key: string]: string[];
}

const getSettingsPath = (userId: string, channelId: string) =>
    `users/${userId}/channels/${channelId}/settings`;

export const SettingsService = {
    subscribeToGeneralSettings: (
        userId: string,
        channelId: string,
        callback: (settings: GeneralSettings | null) => void
    ) => {
        return subscribeToDoc<GeneralSettings>(
            getSettingsPath(userId, channelId),
            'general',
            callback
        );
    },

    updateGeneralSettings: async (
        userId: string,
        channelId: string,
        settings: Partial<GeneralSettings>
    ) => {
        await setDocument(
            getSettingsPath(userId, channelId),
            'general',
            settings,
            true
        );
    },

    subscribeToSyncSettings: (
        userId: string,
        channelId: string,
        callback: (settings: SyncSettings | null) => void
    ) => {
        return subscribeToDoc<SyncSettings>(
            getSettingsPath(userId, channelId),
            'sync',
            callback
        );
    },

    updateSyncSettings: async (
        userId: string,
        channelId: string,
        settings: SyncSettings
    ) => {
        await setDocument(
            getSettingsPath(userId, channelId),
            'sync',
            settings,
            true
        );
    },

    subscribeToCloneSettings: (
        userId: string,
        channelId: string,
        callback: (settings: CloneSettings | null) => void
    ) => {
        return subscribeToDoc<CloneSettings>(
            getSettingsPath(userId, channelId),
            'clone',
            callback
        );
    },

    updateCloneSettings: async (
        userId: string,
        channelId: string,
        settings: CloneSettings
    ) => {
        await setDocument(
            getSettingsPath(userId, channelId),
            'clone',
            settings,
            true
        );
    },

    subscribeToRecommendationOrders: (
        userId: string,
        channelId: string,
        callback: (orders: RecommendationOrder | null) => void
    ) => {
        return subscribeToDoc<RecommendationOrder>(
            getSettingsPath(userId, channelId),
            'recommendationOrders',
            callback
        );
    },

    updateRecommendationOrders: async (
        userId: string,
        channelId: string,
        orders: RecommendationOrder
    ) => {
        await setDocument(
            getSettingsPath(userId, channelId),
            'recommendationOrders',
            orders,
            true
        );
    },

    subscribeToVideoOrder: (
        userId: string,
        channelId: string,
        callback: (order: string[] | null) => void
    ) => {
        return subscribeToDoc<{ order: string[] }>(
            getSettingsPath(userId, channelId),
            'videoOrder',
            (data) => callback(data?.order || null)
        );
    },

    updateVideoOrder: async (
        userId: string,
        channelId: string,
        order: string[]
    ) => {
        await setDocument(
            getSettingsPath(userId, channelId),
            'videoOrder',
            { order },
            true
        );
    },

    subscribeToPlaylistOrder: (
        userId: string,
        channelId: string,
        callback: (order: string[] | null) => void
    ) => {
        return subscribeToDoc<{ order: string[] }>(
            getSettingsPath(userId, channelId),
            'playlistOrder',
            (data) => callback(data?.order || null)
        );
    },

    updatePlaylistOrder: async (
        userId: string,
        channelId: string,
        order: string[]
    ) => {
        await setDocument(
            getSettingsPath(userId, channelId),
            'playlistOrder',
            { order },
            true
        );
    }
};
