import { useState, useMemo, useCallback } from 'react';
import { useTrendStore } from '../../../../core/stores/trends/trendStore';
import { useChannelStore } from '../../../../core/stores/channelStore';
import { useChannels } from '../../../../core/hooks/useChannels';
import { useAuth } from '../../../../core/hooks/useAuth';
import { TrendService } from '../../../../core/services/trendService';
import type { TrendChannel, TrendNiche } from '../../../../core/types/trends';
import type { Channel } from '../../../../core/services/channelService';

export type CopyState = 'idle' | 'selecting' | 'conflict' | 'copying' | 'success' | 'error';

interface CopyChannelState {
    state: CopyState;
    targetChannelId: string | null;
    conflictData: {
        existingNiches: TrendNiche[];
    } | null;
    error: string | null;
}

interface UseCopyChannelReturn {
    // State
    copyState: CopyState;
    targetChannelId: string | null;
    availableTargets: Channel[];
    conflictData: CopyChannelState['conflictData'];
    error: string | null;

    // Preview data
    nichesToCopy: TrendNiche[];
    videosCount: number;
    hiddenVideosCount: number;

    // Actions
    setTargetChannel: (channelId: string) => void;
    checkAndCopy: () => Promise<void>;
    confirmMerge: () => Promise<void>;
    cancel: () => void;
    reset: () => void;
}

/**
 * Hook for managing Copy TrendChannel flow.
 * Handles target selection, conflict detection, and copy execution.
 */
export const useCopyChannel = (sourceTrendChannel: TrendChannel | null): UseCopyChannelReturn => {
    const { user } = useAuth();
    const { currentChannel } = useChannelStore();
    const { data: userChannels = [] } = useChannels(user?.uid || '');

    const {
        niches,
        videos,
        videoNicheAssignments,
        hiddenVideos
    } = useTrendStore();

    const [state, setState] = useState<CopyChannelState>({
        state: 'selecting',
        targetChannelId: null,
        conflictData: null,
        error: null
    });

    // Filter out current channel from targets
    const availableTargets = useMemo(() => {
        if (!currentChannel) return [];
        return userChannels.filter(c => c.id !== currentChannel.id);
    }, [userChannels, currentChannel]);

    // Get niches related to this TrendChannel
    const nichesToCopy = useMemo(() => {
        if (!sourceTrendChannel) return [];

        return niches.filter(n => {
            // Global niches - check if they have videos from this channel
            if (n.type === 'global') {
                const hasVideosFromChannel = videos.some(v => {
                    if (v.channelId !== sourceTrendChannel.id) return false;
                    const assignments = videoNicheAssignments[v.id] || [];
                    return assignments.some(a => a.nicheId === n.id);
                });
                return hasVideosFromChannel;
            }
            // Local niches - must belong to this channel
            return n.type === 'local' && n.channelId === sourceTrendChannel.id;
        });
    }, [niches, videos, videoNicheAssignments, sourceTrendChannel]);

    // Count videos assigned to these niches from this channel
    const videosCount = useMemo(() => {
        if (!sourceTrendChannel) return 0;

        const nicheIds = new Set(nichesToCopy.map(n => n.id));
        let count = 0;

        videos.forEach(v => {
            if (v.channelId !== sourceTrendChannel.id) return;
            const assignments = videoNicheAssignments[v.id] || [];
            if (assignments.some(a => nicheIds.has(a.nicheId))) {
                count++;
            }
        });

        return count;
    }, [videos, videoNicheAssignments, nichesToCopy, sourceTrendChannel]);

    // Count hidden videos from this channel
    const hiddenVideosCount = useMemo(() => {
        if (!sourceTrendChannel) return 0;
        return hiddenVideos.filter(hv => hv.channelId === sourceTrendChannel.id).length;
    }, [hiddenVideos, sourceTrendChannel]);

    const setTargetChannel = useCallback((channelId: string) => {
        setState(prev => ({ ...prev, targetChannelId: channelId }));
    }, []);

    /**
     * Check if TrendChannel exists in target and either copy directly or show conflict.
     */
    const checkAndCopy = useCallback(async () => {
        if (!user?.uid || !currentChannel || !sourceTrendChannel || !state.targetChannelId) {
            return;
        }

        setState(prev => ({ ...prev, state: 'copying' }));

        try {
            // Check if channel exists in target
            const existsInTarget = await TrendService.channelExistsInUserChannel(
                user.uid,
                state.targetChannelId,
                sourceTrendChannel.id
            );

            if (existsInTarget) {
                // Get existing niches in target for conflict info
                const targetNiches = await TrendService.getNichesForUserChannel(
                    user.uid,
                    state.targetChannelId
                );

                setState(prev => ({
                    ...prev,
                    state: 'conflict',
                    conflictData: { existingNiches: targetNiches }
                }));
                return;
            }

            // No conflict - copy directly
            await TrendService.copyTrendChannel(
                user.uid,
                currentChannel.id,
                state.targetChannelId,
                sourceTrendChannel.id,
                false // not a merge
            );

            setState(prev => ({ ...prev, state: 'success' }));
        } catch (err) {
            setState(prev => ({
                ...prev,
                state: 'error',
                error: err instanceof Error ? err.message : 'Copy failed'
            }));
        }
    }, [user?.uid, currentChannel, sourceTrendChannel, state.targetChannelId]);

    /**
     * User confirmed merge after conflict warning.
     */
    const confirmMerge = useCallback(async () => {
        if (!user?.uid || !currentChannel || !sourceTrendChannel || !state.targetChannelId) {
            return;
        }

        setState(prev => ({ ...prev, state: 'copying' }));

        try {
            await TrendService.copyTrendChannel(
                user.uid,
                currentChannel.id,
                state.targetChannelId,
                sourceTrendChannel.id,
                true // merge mode
            );

            setState(prev => ({ ...prev, state: 'success' }));
        } catch (err) {
            setState(prev => ({
                ...prev,
                state: 'error',
                error: err instanceof Error ? err.message : 'Merge failed'
            }));
        }
    }, [user?.uid, currentChannel, sourceTrendChannel, state.targetChannelId]);

    const cancel = useCallback(() => {
        setState(prev => ({ ...prev, state: 'selecting', conflictData: null }));
    }, []);

    const reset = useCallback(() => {
        setState({
            state: 'selecting',
            targetChannelId: null,
            conflictData: null,
            error: null
        });
    }, []);

    return {
        copyState: state.state,
        targetChannelId: state.targetChannelId,
        availableTargets,
        conflictData: state.conflictData,
        error: state.error,
        nichesToCopy,
        videosCount,
        hiddenVideosCount,
        setTargetChannel,
        checkAndCopy,
        confirmMerge,
        cancel,
        reset
    };
};
