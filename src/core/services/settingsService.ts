import {
    subscribeToDoc,
    setDocument,
    fetchDoc,
} from './firestore';

export interface SyncSettings {
    autoSync: boolean;
    frequencyHours: number;
    syncTheme?: boolean;
    syncCardsPerRow?: boolean;
    syncCloneSettings?: boolean;
    lastGlobalSync?: number;
    trendSync?: {
        enabled: boolean;
        lastRun?: number;
    };
}

export interface CloneSettings {
    cloneDurationSeconds: number;
}

export interface GeneralSettings {
    cardsPerRow: number;
    hiddenPlaylistIds: string[];
    theme: 'light' | 'dark' | 'device';
    apiKey?: string; // Now stored in Firestore
}

export interface RecommendationOrder {
    [key: string]: string[];
}

export interface CheckinRule {
    id: string;
    hoursAfterPublish: number;
    badgeText: string;
    badgeColor: string;
    isRequired: boolean;
    displayUnit?: 'hours' | 'days' | 'weeks';
}

export interface PackagingSettings {
    checkinRules: CheckinRule[];
}

export interface UploadDefaults {
    title?: string;
    description?: string;
    tags?: string[];
}

export interface CTRRule {
    id: string;
    operator: '<' | '>' | '<=' | '>=' | 'between';
    value: number;
    maxValue?: number;
    color: string;
}

export interface TrafficSettings {
    ctrRules: CTRRule[];
}

const getSettingsPath = (userId: string, channelId: string) =>
    `users/${userId}/channels/${channelId}/settings`;

export const SettingsService = {
    fetchGeneralSettings: async (userId: string, channelId: string) => {
        return fetchDoc<GeneralSettings>(getSettingsPath(userId, channelId), 'general');
    },

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

    fetchSyncSettings: async (userId: string, channelId: string) => {
        return fetchDoc<SyncSettings>(getSettingsPath(userId, channelId), 'sync');
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

    fetchCloneSettings: async (userId: string, channelId: string) => {
        return fetchDoc<CloneSettings>(getSettingsPath(userId, channelId), 'clone');
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

    fetchRecommendationOrders: async (userId: string, channelId: string) => {
        return fetchDoc<RecommendationOrder>(getSettingsPath(userId, channelId), 'recommendationOrders');
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

    fetchVideoOrder: async (userId: string, channelId: string) => {
        const data = await fetchDoc<{ order: string[] }>(getSettingsPath(userId, channelId), 'videoOrder');
        return data?.order || null;
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

    fetchPlaylistOrder: async (userId: string, channelId: string) => {
        const data = await fetchDoc<{ order: string[] }>(getSettingsPath(userId, channelId), 'playlistOrder');
        return data?.order || null;
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
    },

    fetchPackagingSettings: async (userId: string, channelId: string) => {
        return fetchDoc<PackagingSettings>(getSettingsPath(userId, channelId), 'packaging');
    },

    subscribeToPackagingSettings: (
        userId: string,
        channelId: string,
        callback: (settings: PackagingSettings | null) => void
    ) => {
        return subscribeToDoc<PackagingSettings>(
            getSettingsPath(userId, channelId),
            'packaging',
            callback
        );
    },

    updatePackagingSettings: async (
        userId: string,
        channelId: string,
        settings: PackagingSettings
    ) => {
        await setDocument(
            getSettingsPath(userId, channelId),
            'packaging',
            settings,
            true
        );
    },

    fetchUploadDefaults: async (userId: string, channelId: string) => {
        return fetchDoc<UploadDefaults>(getSettingsPath(userId, channelId), 'uploadDefaults');
    },

    subscribeToUploadDefaults: (
        userId: string,
        channelId: string,
        callback: (settings: UploadDefaults | null) => void
    ) => {
        return subscribeToDoc<UploadDefaults>(
            getSettingsPath(userId, channelId),
            'uploadDefaults',
            callback
        );
    },

    updateUploadDefaults: async (
        userId: string,
        channelId: string,
        settings: UploadDefaults
    ) => {
        await setDocument(
            getSettingsPath(userId, channelId),
            'uploadDefaults',
            settings,
            true
        );
    },

    fetchTrafficSettings: async (userId: string, channelId: string) => {
        return fetchDoc<TrafficSettings>(getSettingsPath(userId, channelId), 'traffic');
    },

    subscribeToTrafficSettings: (
        userId: string,
        channelId: string,
        callback: (settings: TrafficSettings | null) => void
    ) => {
        return subscribeToDoc<TrafficSettings>(
            getSettingsPath(userId, channelId),
            'traffic',
            callback
        );
    },

    updateTrafficSettings: async (
        userId: string,
        channelId: string,
        settings: TrafficSettings
    ) => {
        await setDocument(
            getSettingsPath(userId, channelId),
            'traffic',
            settings,
            true
        );
    }
};
