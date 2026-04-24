import { useState, useMemo, useCallback } from 'react';
import { useTrendStore } from '../../../../core/stores/trends/trendStore';
import { useChannelStore } from '../../../../core/stores/channelStore';
import { useChannels } from '../../../../core/hooks/useChannels';
import { useAuth } from '../../../../core/hooks/useAuth';
import { TrendService } from '../../../../core/services/trendService';
import { logger } from '../../../../core/utils/logger';
import type { TrendChannel, TrendNiche } from '../../../../core/types/trends';
import type { Channel } from '../../../../core/services/channelService';

export type TransferMode = 'copy' | 'move';
export type TransferState = 'selecting' | 'conflict' | 'running' | 'success' | 'error' | 'partialMove';

interface ChannelTransferStateShape {
    state: TransferState;
    targetChannelId: string | null;
    mode: TransferMode;
    conflictData: {
        existingNiches: TrendNiche[];
    } | null;
    error: string | null;
}

interface UseChannelTransferReturn {
    state: TransferState;
    mode: TransferMode;
    targetChannelId: string | null;
    availableTargets: Channel[];
    conflictData: ChannelTransferStateShape['conflictData'];
    error: string | null;

    nichesToTransfer: TrendNiche[];
    videosCount: number;
    hiddenVideosCount: number;

    setMode: (mode: TransferMode) => void;
    setTargetChannel: (channelId: string) => void;
    checkAndExecute: () => Promise<void>;
    confirmMerge: () => Promise<void>;
    retryCleanup: () => Promise<void>;
    cancel: () => void;
    reset: () => void;
}

/**
 * Hook for the Channel Transfer flow (Copy or Move).
 *
 * Copy: target user channel gains a full replica of the trend channel (videos,
 * snapshots, niches, assignments, hidden videos). Source is untouched.
 *
 * Move: Copy, then delete source. Non-atomic — if the delete fails after the
 * copy succeeded we surface `partialMove` so the user can retry just the
 * cleanup. `deleteSourceTrendChannelData` is idempotent.
 */
export const useChannelTransfer = (sourceTrendChannel: TrendChannel | null): UseChannelTransferReturn => {
    const { user } = useAuth();
    const { currentChannel } = useChannelStore();
    const { data: userChannels = [] } = useChannels(user?.uid || '');

    const {
        niches,
        videos,
        videoNicheAssignments,
        hiddenVideos
    } = useTrendStore();

    const [state, setState] = useState<ChannelTransferStateShape>({
        state: 'selecting',
        targetChannelId: null,
        mode: 'copy',
        conflictData: null,
        error: null
    });

    const availableTargets = useMemo(() => {
        if (!currentChannel) return [];
        return userChannels.filter(c => c.id !== currentChannel.id);
    }, [userChannels, currentChannel]);

    const nichesToTransfer = useMemo(() => {
        if (!sourceTrendChannel) return [];
        return niches.filter(n => {
            if (n.type === 'global') {
                return videos.some(v => {
                    if (v.channelId !== sourceTrendChannel.id) return false;
                    const assignments = videoNicheAssignments[v.id] || [];
                    return assignments.some(a => a.nicheId === n.id);
                });
            }
            return n.type === 'local' && n.channelId === sourceTrendChannel.id;
        });
    }, [niches, videos, videoNicheAssignments, sourceTrendChannel]);

    const videosCount = useMemo(() => {
        if (!sourceTrendChannel) return 0;
        const nicheIds = new Set(nichesToTransfer.map(n => n.id));
        let count = 0;
        videos.forEach(v => {
            if (v.channelId !== sourceTrendChannel.id) return;
            const assignments = videoNicheAssignments[v.id] || [];
            if (assignments.some(a => nicheIds.has(a.nicheId))) {
                count++;
            }
        });
        return count;
    }, [videos, videoNicheAssignments, nichesToTransfer, sourceTrendChannel]);

    const hiddenVideosCount = useMemo(() => {
        if (!sourceTrendChannel) return 0;
        return hiddenVideos.filter(hv => hv.channelId === sourceTrendChannel.id).length;
    }, [hiddenVideos, sourceTrendChannel]);

    const setMode = useCallback((mode: TransferMode) => {
        setState(prev => ({ ...prev, mode }));
    }, []);

    const setTargetChannel = useCallback((channelId: string) => {
        setState(prev => ({ ...prev, targetChannelId: channelId }));
    }, []);

    const runCopyOrMove = useCallback(async (merge: boolean): Promise<void> => {
        const { mode, targetChannelId } = state;
        if (!user?.uid || !currentChannel || !sourceTrendChannel || !targetChannelId) return;

        try {
            if (mode === 'copy') {
                await TrendService.copyTrendChannel(user.uid, currentChannel.id, targetChannelId, sourceTrendChannel.id, merge);
                setState(prev => ({ ...prev, state: 'success' }));
                return;
            }

            // Move: copy succeeds first, then delete source. If delete fails, surface partialMove.
            try {
                await TrendService.copyTrendChannel(user.uid, currentChannel.id, targetChannelId, sourceTrendChannel.id, merge);
            } catch (copyErr) {
                logger.error('Move: copy step failed, source untouched', {
                    component: 'useChannelTransfer',
                    channelId: sourceTrendChannel.id,
                    error: copyErr instanceof Error ? copyErr.message : String(copyErr)
                });
                throw copyErr;
            }

            try {
                await TrendService.deleteSourceTrendChannelData(user.uid, currentChannel.id, sourceTrendChannel.id);
                setState(prev => ({ ...prev, state: 'success' }));
            } catch (deleteErr) {
                logger.error('Move: delete step failed after successful copy — partial move', {
                    component: 'useChannelTransfer',
                    channelId: sourceTrendChannel.id,
                    error: deleteErr instanceof Error ? deleteErr.message : String(deleteErr)
                });
                setState(prev => ({
                    ...prev,
                    state: 'partialMove',
                    error: deleteErr instanceof Error ? deleteErr.message : 'Source cleanup failed'
                }));
            }
        } catch (err) {
            setState(prev => ({
                ...prev,
                state: 'error',
                error: err instanceof Error ? err.message : 'Transfer failed'
            }));
        }
    }, [state, user?.uid, currentChannel, sourceTrendChannel]);

    const checkAndExecute = useCallback(async () => {
        if (!user?.uid || !currentChannel || !sourceTrendChannel || !state.targetChannelId) return;
        setState(prev => ({ ...prev, state: 'running' }));

        try {
            const existsInTarget = await TrendService.channelExistsInUserChannel(
                user.uid,
                state.targetChannelId,
                sourceTrendChannel.id
            );

            if (existsInTarget) {
                const targetNiches = await TrendService.getNichesForUserChannel(user.uid, state.targetChannelId);
                setState(prev => ({
                    ...prev,
                    state: 'conflict',
                    conflictData: { existingNiches: targetNiches }
                }));
                return;
            }

            await runCopyOrMove(false);
        } catch (err) {
            setState(prev => ({
                ...prev,
                state: 'error',
                error: err instanceof Error ? err.message : 'Transfer failed'
            }));
        }
    }, [user?.uid, currentChannel, sourceTrendChannel, state.targetChannelId, runCopyOrMove]);

    const confirmMerge = useCallback(async () => {
        setState(prev => ({ ...prev, state: 'running' }));
        await runCopyOrMove(true);
    }, [runCopyOrMove]);

    const retryCleanup = useCallback(async () => {
        if (!user?.uid || !currentChannel || !sourceTrendChannel) return;
        setState(prev => ({ ...prev, state: 'running' }));
        try {
            await TrendService.deleteSourceTrendChannelData(user.uid, currentChannel.id, sourceTrendChannel.id);
            setState(prev => ({ ...prev, state: 'success' }));
        } catch (err) {
            setState(prev => ({
                ...prev,
                state: 'partialMove',
                error: err instanceof Error ? err.message : 'Source cleanup failed'
            }));
        }
    }, [user?.uid, currentChannel, sourceTrendChannel]);

    const cancel = useCallback(() => {
        setState(prev => ({ ...prev, state: 'selecting', conflictData: null }));
    }, []);

    const reset = useCallback(() => {
        setState({
            state: 'selecting',
            targetChannelId: null,
            mode: 'copy',
            conflictData: null,
            error: null
        });
    }, []);

    return {
        state: state.state,
        mode: state.mode,
        targetChannelId: state.targetChannelId,
        availableTargets,
        conflictData: state.conflictData,
        error: state.error,
        nichesToTransfer,
        videosCount,
        hiddenVideosCount,
        setMode,
        setTargetChannel,
        checkAndExecute,
        confirmMerge,
        retryCleanup,
        cancel,
        reset
    };
};
