import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useAuth } from './useAuth';
import { useChannelStore } from '../stores/channelStore';
import { SettingsService, type GeneralSettings, type SyncSettings, type CloneSettings, type RecommendationOrder, type PackagingSettings, type UploadDefaults, type TrafficSettings, type PickerSettings } from '../services/settingsService';

const DEFAULT_GENERAL_SETTINGS: GeneralSettings = {
    cardsPerRow: 3,
    hiddenPlaylistIds: [],
    theme: 'device'
};

const DEFAULT_SYNC_SETTINGS: SyncSettings = {
    autoSync: true,
    frequencyHours: 24,
    syncTheme: true,
    syncCardsPerRow: true,
    syncCloneSettings: true,
    lastGlobalSync: 0
};

const DEFAULT_CLONE_SETTINGS: CloneSettings = {
    cloneDurationSeconds: 60
};

const DEFAULT_PACKAGING_SETTINGS: PackagingSettings = {
    checkinRules: []
};

const DEFAULT_UPLOAD_DEFAULTS: UploadDefaults = {
    title: '',
    description: '',
    tags: []
};

const DEFAULT_TRAFFIC_SETTINGS: TrafficSettings = {
    ctrRules: []
};

const DEFAULT_PICKER_SETTINGS: PickerSettings = {
    winnerCount: 3
};

export const useSettings = () => {
    const { user } = useAuth();
    const { currentChannel } = useChannelStore();
    const userId = user?.uid || '';
    const channelId = currentChannel?.id || '';
    const queryClient = useQueryClient();
    const enabled = !!userId && !!channelId;

    // --- Queries ---

    const generalQuery = useQuery({
        queryKey: ['settings', 'general', userId, channelId],
        queryFn: async () => {
            const data = await SettingsService.fetchGeneralSettings(userId, channelId);
            return data || DEFAULT_GENERAL_SETTINGS;
        },
        enabled,
        staleTime: Infinity
    });
    const generalSettings = generalQuery.data || DEFAULT_GENERAL_SETTINGS;

    const syncQuery = useQuery({
        queryKey: ['settings', 'sync', userId, channelId],
        queryFn: async () => {
            const data = await SettingsService.fetchSyncSettings(userId, channelId);
            return data || DEFAULT_SYNC_SETTINGS;
        },
        enabled,
        staleTime: Infinity
    });
    const syncSettings = syncQuery.data || DEFAULT_SYNC_SETTINGS;

    const { data: cloneSettings = DEFAULT_CLONE_SETTINGS } = useQuery({
        queryKey: ['settings', 'clone', userId, channelId],
        queryFn: async () => {
            const data = await SettingsService.fetchCloneSettings(userId, channelId);
            return data || DEFAULT_CLONE_SETTINGS;
        },
        enabled,
        staleTime: Infinity
    });

    const { data: recommendationOrders = {} } = useQuery({
        queryKey: ['settings', 'recommendationOrders', userId, channelId],
        queryFn: async () => {
            const data = await SettingsService.fetchRecommendationOrders(userId, channelId);
            return data || {};
        },
        enabled,
        staleTime: Infinity
    });

    const { data: videoOrder = [] } = useQuery({
        queryKey: ['settings', 'videoOrder', userId, channelId],
        queryFn: async () => {
            const data = await SettingsService.fetchVideoOrder(userId, channelId);
            return data || [];
        },
        enabled,
        staleTime: Infinity
    });

    const { data: playlistOrder = [] } = useQuery({
        queryKey: ['settings', 'playlistOrder', userId, channelId],
        queryFn: async () => {
            const data = await SettingsService.fetchPlaylistOrder(userId, channelId);
            return data || [];
        },
        enabled,
        staleTime: Infinity
    });

    const packagingQuery = useQuery({
        queryKey: ['settings', 'packaging', userId, channelId],
        queryFn: async () => {
            const data = await SettingsService.fetchPackagingSettings(userId, channelId);
            return data || DEFAULT_PACKAGING_SETTINGS;
        },
        enabled,
        staleTime: Infinity
    });
    const packagingSettings = packagingQuery.data || DEFAULT_PACKAGING_SETTINGS;

    const { data: uploadDefaults = DEFAULT_UPLOAD_DEFAULTS } = useQuery({
        queryKey: ['settings', 'uploadDefaults', userId, channelId],
        queryFn: async () => {
            const data = await SettingsService.fetchUploadDefaults(userId, channelId);
            return data || DEFAULT_UPLOAD_DEFAULTS;
        },
        enabled,
        staleTime: Infinity
    });

    const trafficQuery = useQuery({
        queryKey: ['settings', 'traffic', userId, channelId],
        queryFn: async () => {
            const data = await SettingsService.fetchTrafficSettings(userId, channelId);
            return data || DEFAULT_TRAFFIC_SETTINGS;
        },
        enabled,
        staleTime: Infinity
    });
    const trafficSettings = trafficQuery.data || DEFAULT_TRAFFIC_SETTINGS;

    const pickerQuery = useQuery({
        queryKey: ['settings', 'picker', userId, channelId],
        queryFn: async () => {
            const data = await SettingsService.fetchPickerSettings(userId, channelId);
            return data || DEFAULT_PICKER_SETTINGS;
        },
        enabled,
        staleTime: Infinity
    });
    const pickerSettings = pickerQuery.data || DEFAULT_PICKER_SETTINGS;

    // --- Subscriptions ---

    useEffect(() => {
        if (!enabled) return;

        const unsubGeneral = SettingsService.subscribeToGeneralSettings(userId, channelId, (data) => {
            if (data) queryClient.setQueryData(['settings', 'general', userId, channelId], (old: GeneralSettings) => ({ ...old, ...data }));
        });

        const unsubSync = SettingsService.subscribeToSyncSettings(userId, channelId, (data) => {
            if (data) queryClient.setQueryData(['settings', 'sync', userId, channelId], data);
        });

        const unsubClone = SettingsService.subscribeToCloneSettings(userId, channelId, (data) => {
            if (data) queryClient.setQueryData(['settings', 'clone', userId, channelId], data);
        });

        const unsubRecs = SettingsService.subscribeToRecommendationOrders(userId, channelId, (data) => {
            if (data) queryClient.setQueryData(['settings', 'recommendationOrders', userId, channelId], data);
        });

        const unsubVideoOrder = SettingsService.subscribeToVideoOrder(userId, channelId, (data) => {
            if (data) queryClient.setQueryData(['settings', 'videoOrder', userId, channelId], data);
        });

        const unsubPlaylistOrder = SettingsService.subscribeToPlaylistOrder(userId, channelId, (data) => {
            if (data) queryClient.setQueryData(['settings', 'playlistOrder', userId, channelId], data);
        });

        const unsubPackaging = SettingsService.subscribeToPackagingSettings(userId, channelId, (data) => {
            if (data) queryClient.setQueryData(['settings', 'packaging', userId, channelId], data);
        });

        const unsubUploadDefaults = SettingsService.subscribeToUploadDefaults(userId, channelId, (data) => {
            if (data) queryClient.setQueryData(['settings', 'uploadDefaults', userId, channelId], data);
        });

        const unsubTraffic = SettingsService.subscribeToTrafficSettings(userId, channelId, (data) => {
            if (data) queryClient.setQueryData(['settings', 'traffic', userId, channelId], data);
        });

        const unsubPicker = SettingsService.subscribeToPickerSettings(userId, channelId, (data) => {
            if (data) queryClient.setQueryData(['settings', 'picker', userId, channelId], data);
        });

        return () => {
            unsubGeneral();
            unsubSync();
            unsubClone();
            unsubRecs();
            unsubVideoOrder();
            unsubPlaylistOrder();
            unsubPackaging();
            unsubUploadDefaults();
            unsubTraffic();
            unsubPicker();
        };
    }, [userId, channelId, enabled, queryClient]);

    // --- Mutations ---

    const updateGeneralSettingsMutation = useMutation({
        mutationFn: async (settings: Partial<GeneralSettings>) => {
            await SettingsService.updateGeneralSettings(userId, channelId, settings);
        },
        onMutate: async (newSettings) => {
            await queryClient.cancelQueries({ queryKey: ['settings', 'general', userId, channelId] });
            const previousSettings = queryClient.getQueryData(['settings', 'general', userId, channelId]);
            queryClient.setQueryData(['settings', 'general', userId, channelId], (old: GeneralSettings) => ({ ...old, ...newSettings }));
            return { previousSettings };
        },
        onError: (_err, _newSettings, context) => {
            queryClient.setQueryData(['settings', 'general', userId, channelId], context?.previousSettings);
        }
    });

    const updateSyncSettingsMutation = useMutation({
        mutationFn: async (settings: SyncSettings) => {
            await SettingsService.updateSyncSettings(userId, channelId, settings);
        },
        onMutate: async (newSettings) => {
            await queryClient.cancelQueries({ queryKey: ['settings', 'sync', userId, channelId] });
            const previousSettings = queryClient.getQueryData(['settings', 'sync', userId, channelId]);
            queryClient.setQueryData(['settings', 'sync', userId, channelId], newSettings);
            return { previousSettings };
        },
        onError: (_err, _newSettings, context) => {
            queryClient.setQueryData(['settings', 'sync', userId, channelId], context?.previousSettings);
        }
    });

    const updateCloneSettingsMutation = useMutation({
        mutationFn: async (settings: CloneSettings) => {
            await SettingsService.updateCloneSettings(userId, channelId, settings);
        },
        onMutate: async (newSettings) => {
            await queryClient.cancelQueries({ queryKey: ['settings', 'clone', userId, channelId] });
            const previousSettings = queryClient.getQueryData(['settings', 'clone', userId, channelId]);
            queryClient.setQueryData(['settings', 'clone', userId, channelId], newSettings);
            return { previousSettings };
        },
        onError: (_err, _newSettings, context) => {
            queryClient.setQueryData(['settings', 'clone', userId, channelId], context?.previousSettings);
        }
    });

    const updateRecommendationOrdersMutation = useMutation({
        mutationFn: async (orders: RecommendationOrder) => {
            await SettingsService.updateRecommendationOrders(userId, channelId, orders);
        },
        onMutate: async (newOrders) => {
            await queryClient.cancelQueries({ queryKey: ['settings', 'recommendationOrders', userId, channelId] });
            const previousOrders = queryClient.getQueryData(['settings', 'recommendationOrders', userId, channelId]);
            queryClient.setQueryData(['settings', 'recommendationOrders', userId, channelId], newOrders);
            return { previousOrders };
        },
        onError: (_err, _newOrders, context) => {
            queryClient.setQueryData(['settings', 'recommendationOrders', userId, channelId], context?.previousOrders);
        }
    });

    const updateVideoOrderMutation = useMutation({
        mutationFn: async (order: string[]) => {
            await SettingsService.updateVideoOrder(userId, channelId, order);
        },
        onMutate: async (newOrder) => {
            await queryClient.cancelQueries({ queryKey: ['settings', 'videoOrder', userId, channelId] });
            const previousOrder = queryClient.getQueryData(['settings', 'videoOrder', userId, channelId]);
            queryClient.setQueryData(['settings', 'videoOrder', userId, channelId], newOrder);
            return { previousOrder };
        },
        onError: (_err, _newOrder, context) => {
            queryClient.setQueryData(['settings', 'videoOrder', userId, channelId], context?.previousOrder);
        }
    });

    const updatePlaylistOrderMutation = useMutation({
        mutationFn: async (order: string[]) => {
            await SettingsService.updatePlaylistOrder(userId, channelId, order);
        },
        onMutate: async (newOrder) => {
            await queryClient.cancelQueries({ queryKey: ['settings', 'playlistOrder', userId, channelId] });
            const previousOrder = queryClient.getQueryData(['settings', 'playlistOrder', userId, channelId]);
            queryClient.setQueryData(['settings', 'playlistOrder', userId, channelId], newOrder);
            return { previousOrder };
        },
        onError: (_err, _newOrder, context) => {
            queryClient.setQueryData(['settings', 'playlistOrder', userId, channelId], context?.previousOrder);
        }
    });

    const updatePackagingSettingsMutation = useMutation({
        mutationFn: async (settings: PackagingSettings) => {
            await SettingsService.updatePackagingSettings(userId, channelId, settings);
        },
        onMutate: async (newSettings) => {
            await queryClient.cancelQueries({ queryKey: ['settings', 'packaging', userId, channelId] });
            const previousSettings = queryClient.getQueryData(['settings', 'packaging', userId, channelId]);
            queryClient.setQueryData(['settings', 'packaging', userId, channelId], newSettings);
            return { previousSettings };
        },
        onError: (_err, _newSettings, context) => {
            queryClient.setQueryData(['settings', 'packaging', userId, channelId], context?.previousSettings);
        }
    });

    const updateUploadDefaultsMutation = useMutation({
        mutationFn: async (settings: UploadDefaults) => {
            await SettingsService.updateUploadDefaults(userId, channelId, settings);
        },
        onMutate: async (newSettings) => {
            await queryClient.cancelQueries({ queryKey: ['settings', 'uploadDefaults', userId, channelId] });
            const previousSettings = queryClient.getQueryData(['settings', 'uploadDefaults', userId, channelId]);
            queryClient.setQueryData(['settings', 'uploadDefaults', userId, channelId], newSettings);
            return { previousSettings };
        },
        onError: (_err, _newSettings, context) => {
            queryClient.setQueryData(['settings', 'uploadDefaults', userId, channelId], context?.previousSettings);
        }
    });

    const updateTrafficSettingsMutation = useMutation({
        mutationFn: async (settings: TrafficSettings) => {
            await SettingsService.updateTrafficSettings(userId, channelId, settings);
        },
        onMutate: async (newSettings) => {
            await queryClient.cancelQueries({ queryKey: ['settings', 'traffic', userId, channelId] });
            const previousSettings = queryClient.getQueryData(['settings', 'traffic', userId, channelId]);
            queryClient.setQueryData(['settings', 'traffic', userId, channelId], newSettings);
            return { previousSettings };
        },
        onError: (_err, _newSettings, context) => {
            queryClient.setQueryData(['settings', 'traffic', userId, channelId], context?.previousSettings);
        }
    });

    const updatePickerSettingsMutation = useMutation({
        mutationFn: async (settings: PickerSettings) => {
            await SettingsService.updatePickerSettings(userId, channelId, settings);
        },
        onMutate: async (newSettings) => {
            await queryClient.cancelQueries({ queryKey: ['settings', 'picker', userId, channelId] });
            const previousSettings = queryClient.getQueryData(['settings', 'picker', userId, channelId]);
            queryClient.setQueryData(['settings', 'picker', userId, channelId], newSettings);
            return { previousSettings };
        },
        onError: (_err, _newSettings, context) => {
            queryClient.setQueryData(['settings', 'picker', userId, channelId], context?.previousSettings);
        }
    });

    // Wrapper functions to match store signature
    // Note: The store had (userId, channelId, settings) signature.
    // The hook already knows userId and channelId, but for compatibility we might need to ignore them or check them.
    // However, it's better to update consumers to NOT pass userId/channelId if possible, or just ignore them here.
    // But consumers might be calling it from places where they have different IDs? Unlikely.
    // Let's assume consumers use the hook in components where auth/channel is available.

    return {
        generalSettings,
        syncSettings,
        cloneSettings,
        recommendationOrders,
        videoOrder,
        playlistOrder,
        packagingSettings,
        uploadDefaults,

        updateGeneralSettings: (_uid: string, _cid: string, settings: Partial<GeneralSettings>) => updateGeneralSettingsMutation.mutateAsync(settings),
        updateSyncSettings: (_uid: string, _cid: string, settings: SyncSettings) => updateSyncSettingsMutation.mutateAsync(settings),
        updateCloneSettings: (_uid: string, _cid: string, settings: CloneSettings) => updateCloneSettingsMutation.mutateAsync(settings),
        updateRecommendationOrders: (_uid: string, _cid: string, orders: RecommendationOrder) => updateRecommendationOrdersMutation.mutateAsync(orders),
        updateVideoOrder: (_uid: string, _cid: string, order: string[]) => updateVideoOrderMutation.mutateAsync(order),
        updatePlaylistOrder: (_uid: string, _cid: string, order: string[]) => updatePlaylistOrderMutation.mutateAsync(order),
        updatePackagingSettings: (_uid: string, _cid: string, settings: PackagingSettings) => updatePackagingSettingsMutation.mutateAsync(settings),
        updateUploadDefaults: (_uid: string, _cid: string, settings: UploadDefaults) => updateUploadDefaultsMutation.mutateAsync(settings),
        updateTrafficSettings: (_uid: string, _cid: string, settings: TrafficSettings) => updateTrafficSettingsMutation.mutateAsync(settings),
        trafficSettings,
        pickerSettings,
        updatePickerSettings: (_uid: string, _cid: string, settings: PickerSettings) => updatePickerSettingsMutation.mutateAsync(settings),
        isLoading: generalQuery.isLoading || syncQuery.isLoading || packagingQuery.isLoading || trafficQuery.isLoading || pickerQuery.isLoading
    };
};
