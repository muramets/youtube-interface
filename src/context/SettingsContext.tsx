
import React, { createContext, useContext, useEffect, useState } from 'react';
import { useAuth } from './AuthContext';
import { useChannel } from './ChannelContext';
import {
    SettingsService,
    type GeneralSettings,
    type SyncSettings,
    type CloneSettings,
    type RecommendationOrder
} from '../services/settingsService';

interface SettingsContextType {
    // General
    generalSettings: GeneralSettings;
    updateGeneralSettings: (settings: Partial<GeneralSettings>) => Promise<void>;

    // Sync
    syncSettings: SyncSettings;
    updateSyncSettings: (settings: SyncSettings) => Promise<void>;

    // Clone
    cloneSettings: CloneSettings;
    updateCloneSettings: (settings: CloneSettings) => Promise<void>;

    // Recommendations
    recommendationOrders: RecommendationOrder;
    updateRecommendationOrders: (orders: RecommendationOrder) => Promise<void>;

    // Video Order
    videoOrder: string[];
    updateVideoOrder: (order: string[]) => Promise<void>;

    // Playlist Order
    playlistOrder: string[];
    updatePlaylistOrder: (order: string[]) => Promise<void>;
}

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

export const useSettings = () => {
    const context = useContext(SettingsContext);
    if (!context) {
        throw new Error('useSettings must be used within a SettingsProvider');
    }
    return context;
};

export const SettingsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { user } = useAuth();
    const { currentChannel } = useChannel();

    // State
    const [generalSettings, setGeneralSettings] = useState<GeneralSettings>({
        cardsPerRow: 3,
        hiddenPlaylistIds: [],
        theme: 'dark'
    });
    const [syncSettings, setSyncSettings] = useState<SyncSettings>({
        autoSync: true,
        frequencyHours: 24
    });
    const [cloneSettings, setCloneSettings] = useState<CloneSettings>({
        cloneDurationSeconds: 60
    });
    const [recommendationOrders, setRecommendationOrders] = useState<RecommendationOrder>({});
    const [videoOrder, setVideoOrder] = useState<string[]>([]);
    const [playlistOrder, setPlaylistOrder] = useState<string[]>([]);

    // Subscriptions
    useEffect(() => {
        if (!user || !currentChannel) return;

        const unsubGeneral = SettingsService.subscribeToGeneralSettings(
            user.uid,
            currentChannel.id,
            (data) => data && setGeneralSettings(prev => ({ ...prev, ...data }))
        );

        const unsubSync = SettingsService.subscribeToSyncSettings(
            user.uid,
            currentChannel.id,
            (data) => data && setSyncSettings(data)
        );

        const unsubClone = SettingsService.subscribeToCloneSettings(
            user.uid,
            currentChannel.id,
            (data) => data && setCloneSettings(data)
        );

        const unsubRecs = SettingsService.subscribeToRecommendationOrders(
            user.uid,
            currentChannel.id,
            (data) => data && setRecommendationOrders(data)
        );

        const unsubOrder = SettingsService.subscribeToVideoOrder(
            user.uid,
            currentChannel.id,
            (data) => setVideoOrder(data || [])
        );

        const unsubPlaylistOrder = SettingsService.subscribeToPlaylistOrder(
            user.uid,
            currentChannel.id,
            (data) => setPlaylistOrder(data || [])
        );

        return () => {
            unsubGeneral();
            unsubSync();
            unsubClone();
            unsubRecs();
            unsubOrder();
            unsubPlaylistOrder();
        };
    }, [user, currentChannel]);

    // Actions
    const updateGeneralSettings = async (settings: Partial<GeneralSettings>) => {
        if (!user || !currentChannel) return;
        // Optimistic
        setGeneralSettings(prev => ({ ...prev, ...settings }));
        await SettingsService.updateGeneralSettings(user.uid, currentChannel.id, settings);
    };

    const updateSyncSettings = async (settings: SyncSettings) => {
        if (!user || !currentChannel) return;
        setSyncSettings(settings);
        await SettingsService.updateSyncSettings(user.uid, currentChannel.id, settings);
    };

    const updateCloneSettings = async (settings: CloneSettings) => {
        if (!user || !currentChannel) return;
        setCloneSettings(settings);
        await SettingsService.updateCloneSettings(user.uid, currentChannel.id, settings);
    };

    const updateRecommendationOrders = async (orders: RecommendationOrder) => {
        if (!user || !currentChannel) return;
        setRecommendationOrders(orders);
        await SettingsService.updateRecommendationOrders(user.uid, currentChannel.id, orders);
    };

    const updateVideoOrder = async (order: string[]) => {
        if (!user || !currentChannel) return;
        setVideoOrder(order);
        await SettingsService.updateVideoOrder(user.uid, currentChannel.id, order);
    };

    const updatePlaylistOrder = async (order: string[]) => {
        if (!user || !currentChannel) return;
        setPlaylistOrder(order);
        await SettingsService.updatePlaylistOrder(user.uid, currentChannel.id, order);
    };

    return (
        <SettingsContext.Provider value={{
            generalSettings,
            updateGeneralSettings,
            syncSettings,
            updateSyncSettings,
            cloneSettings,
            updateCloneSettings,
            recommendationOrders,
            updateRecommendationOrders,
            videoOrder,
            updateVideoOrder,
            playlistOrder,
            updatePlaylistOrder
        }}>
            {children}
        </SettingsContext.Provider>
    );
};
