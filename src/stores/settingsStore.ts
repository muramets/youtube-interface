import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { SettingsService, type GeneralSettings, type SyncSettings, type CloneSettings, type RecommendationOrder } from '../services/settingsService';

interface SettingsState {
    // General
    generalSettings: GeneralSettings;
    setGeneralSettings: (settings: Partial<GeneralSettings>) => void;
    updateGeneralSettings: (userId: string, channelId: string, settings: Partial<GeneralSettings>) => Promise<void>;

    // Sync
    syncSettings: SyncSettings;
    setSyncSettings: (settings: SyncSettings) => void;
    updateSyncSettings: (userId: string, channelId: string, settings: SyncSettings) => Promise<void>;

    // Clone
    cloneSettings: CloneSettings;
    setCloneSettings: (settings: CloneSettings) => void;
    updateCloneSettings: (userId: string, channelId: string, settings: CloneSettings) => Promise<void>;

    // Recommendations
    recommendationOrders: RecommendationOrder;
    setRecommendationOrders: (orders: RecommendationOrder) => void;
    updateRecommendationOrders: (userId: string, channelId: string, orders: RecommendationOrder) => Promise<void>;

    // Video Order
    videoOrder: string[];
    setVideoOrder: (order: string[]) => void;
    updateVideoOrder: (userId: string, channelId: string, order: string[]) => Promise<void>;

    // Playlist Order
    playlistOrder: string[];
    setPlaylistOrder: (order: string[]) => void;
    updatePlaylistOrder: (userId: string, channelId: string, order: string[]) => Promise<void>;

    // Subscriptions
    subscribeToGeneralSettings: (userId: string, channelId: string) => () => void;
    subscribeToSyncSettings: (userId: string, channelId: string) => () => void;
    subscribeToCloneSettings: (userId: string, channelId: string) => () => void;
    subscribeToRecommendationOrders: (userId: string, channelId: string) => () => void;
    subscribeToVideoOrder: (userId: string, channelId: string) => () => void;
    subscribeToPlaylistOrder: (userId: string, channelId: string) => () => void;
}

export const useSettingsStore = create<SettingsState>()(
    persist(
        (set, get) => ({
            // General
            generalSettings: {
                cardsPerRow: 3,
                hiddenPlaylistIds: [],
                theme: 'device'
            },
            setGeneralSettings: (settings) => set((state) => ({
                generalSettings: { ...state.generalSettings, ...settings }
            })),
            updateGeneralSettings: async (userId: string, channelId: string, settings: Partial<GeneralSettings>) => {
                get().setGeneralSettings(settings); // Optimistic update
                await SettingsService.updateGeneralSettings(userId, channelId, settings);
            },
            subscribeToGeneralSettings: (userId: string, channelId: string) => {
                return SettingsService.subscribeToGeneralSettings(userId, channelId, (data) => {
                    if (data) set((state) => ({ generalSettings: { ...state.generalSettings, ...data } }));
                });
            },

            // Sync
            syncSettings: {
                autoSync: true,
                frequencyHours: 24,
                syncTheme: true,
                syncCardsPerRow: true,
                syncCloneSettings: true,
                lastGlobalSync: 0
            },
            setSyncSettings: (settings) => set({ syncSettings: settings }),
            updateSyncSettings: async (userId: string, channelId: string, settings: SyncSettings) => {
                set({ syncSettings: settings });
                await SettingsService.updateSyncSettings(userId, channelId, settings);
            },
            subscribeToSyncSettings: (userId: string, channelId: string) => {
                return SettingsService.subscribeToSyncSettings(userId, channelId, (data) => {
                    if (data) set({ syncSettings: data });
                });
            },

            // Clone
            cloneSettings: {
                cloneDurationSeconds: 60
            },
            setCloneSettings: (settings) => set({ cloneSettings: settings }),
            updateCloneSettings: async (userId: string, channelId: string, settings: CloneSettings) => {
                set({ cloneSettings: settings });
                await SettingsService.updateCloneSettings(userId, channelId, settings);
            },
            subscribeToCloneSettings: (userId: string, channelId: string) => {
                return SettingsService.subscribeToCloneSettings(userId, channelId, (data) => {
                    if (data) set({ cloneSettings: data });
                });
            },

            // Recommendations
            recommendationOrders: {},
            setRecommendationOrders: (orders) => set({ recommendationOrders: orders }),
            updateRecommendationOrders: async (userId: string, channelId: string, orders: RecommendationOrder) => {
                set({ recommendationOrders: orders });
                await SettingsService.updateRecommendationOrders(userId, channelId, orders);
            },
            subscribeToRecommendationOrders: (userId: string, channelId: string) => {
                return SettingsService.subscribeToRecommendationOrders(userId, channelId, (data) => {
                    if (data) set({ recommendationOrders: data });
                });
            },

            // Video Order
            videoOrder: [],
            setVideoOrder: (order) => set({ videoOrder: order }),
            updateVideoOrder: async (userId: string, channelId: string, order: string[]) => {
                set({ videoOrder: order });
                await SettingsService.updateVideoOrder(userId, channelId, order);
            },
            subscribeToVideoOrder: (userId: string, channelId: string) => {
                return SettingsService.subscribeToVideoOrder(userId, channelId, (data) => {
                    set({ videoOrder: data || [] });
                });
            },

            // Playlist Order
            playlistOrder: [],
            setPlaylistOrder: (order) => set({ playlistOrder: order }),
            updatePlaylistOrder: async (userId: string, channelId: string, order: string[]) => {
                set({ playlistOrder: order });
                await SettingsService.updatePlaylistOrder(userId, channelId, order);
            },
            subscribeToPlaylistOrder: (userId: string, channelId: string) => {
                return SettingsService.subscribeToPlaylistOrder(userId, channelId, (data) => {
                    set({ playlistOrder: data || [] });
                });
            }
        }),
        {
            name: 'settings-storage',
            partialize: (state) => ({
                generalSettings: state.generalSettings,
                syncSettings: state.syncSettings,
                cloneSettings: state.cloneSettings
                // We don't persist orders here as they are better fetched from DB or have their own logic, 
                // but for offline-first feel we could. Let's stick to what Context did (fetching on mount).
                // Actually, the Context fetched on mount. Zustand persist will load from localStorage.
                // This might cause a flash of old content if we don't sync with DB.
                // For now, let's persist preferences.
            }),
        }
    )
);
