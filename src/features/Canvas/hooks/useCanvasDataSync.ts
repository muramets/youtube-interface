// =============================================================================
// useCanvasDataSync — Auto-sync video data from React Query cache to canvas nodes
// =============================================================================
// Single hook at canvas level: watches the videos query cache and batch-updates
// all video-card nodes when data changes. Replaces per-node manual RefreshCw.
// =============================================================================

import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useCanvasStore } from '../../../core/stores/canvas/canvasStore';
import { useAuth } from '../../../core/hooks/useAuth';
import { useChannelStore } from '../../../core/stores/channelStore';
import { getVideoId } from '../../../core/types/canvas';
import type { VideoDetails } from '../../../core/utils/youtubeApi';
import type { VideoCardContext } from '../../../core/types/appContext';
import { debug } from '../../../core/utils/debug';

/**
 * Watches the React Query videos cache and auto-updates canvas video-card nodes
 * when the underlying data changes (e.g. viewCount refreshed on home page).
 * Runs only while canvas is open. Updates are batched and diffed to avoid
 * unnecessary store writes.
 */
export function useCanvasDataSync(isOpen: boolean) {
    const { user } = useAuth();
    const { currentChannel } = useChannelStore();
    const queryClient = useQueryClient();
    const lastSyncRef = useRef<string>(''); // JSON fingerprint to avoid duplicate syncs

    useEffect(() => {
        if (!isOpen || !user?.uid || !currentChannel?.id) return;

        const queryKey = ['videos', user.uid, currentChannel.id];

        // Sync function: compare cache with canvas nodes, batch-update diffs
        const syncFromCache = () => {
            const cached = queryClient.getQueryData<VideoDetails[]>(queryKey);
            if (!cached || cached.length === 0) return;

            const nodes = useCanvasStore.getState().nodes;
            const videoNodes = nodes.filter(
                (n) => n.type === 'video-card' && n.position !== null
            );
            if (videoNodes.length === 0) return;

            // Build lookup: videoId → VideoDetails
            const videoMap = new Map<string, VideoDetails>();
            for (const v of cached) {
                videoMap.set(v.id, v);
            }

            // Find nodes that need updating
            const updates: { id: string; data: Partial<VideoCardContext> }[] = [];

            for (const node of videoNodes) {
                const videoId = getVideoId(node.data);
                if (!videoId) continue;
                const fresh = videoMap.get(videoId);
                if (!fresh) continue;

                const current = node.data as VideoCardContext;
                const freshData: Partial<VideoCardContext> = {};
                let hasChanges = false;

                // Compare fields and collect diffs
                const newViewCount = fresh.mergedVideoData?.viewCount || fresh.viewCount;
                if (newViewCount && newViewCount !== current.viewCount) {
                    freshData.viewCount = newViewCount;
                    hasChanges = true;
                }

                const newPublishedAt = fresh.mergedVideoData?.publishedAt || fresh.publishedAt;
                if (newPublishedAt && newPublishedAt !== current.publishedAt) {
                    freshData.publishedAt = newPublishedAt;
                    hasChanges = true;
                }

                const newDuration = fresh.mergedVideoData?.duration || fresh.duration;
                if (newDuration && newDuration !== current.duration) {
                    freshData.duration = newDuration;
                    hasChanges = true;
                }

                const newThumbnail = fresh.customImage || fresh.thumbnail;
                if (newThumbnail && newThumbnail !== current.thumbnailUrl) {
                    freshData.thumbnailUrl = newThumbnail;
                    hasChanges = true;
                }

                const newTitle = fresh.title;
                if (newTitle && newTitle !== current.title) {
                    freshData.title = newTitle;
                    hasChanges = true;
                }

                if (fresh.publishedVideoId && fresh.publishedVideoId !== current.publishedVideoId) {
                    freshData.publishedVideoId = fresh.publishedVideoId;
                    hasChanges = true;
                }

                if (hasChanges) {
                    updates.push({ id: node.id, data: freshData });
                }
            }

            if (updates.length === 0) return;

            // Fingerprint to avoid duplicate syncs
            const fingerprint = JSON.stringify(updates.map((u) => [u.id, u.data]));
            if (fingerprint === lastSyncRef.current) return;
            lastSyncRef.current = fingerprint;

            debug.canvas('Auto-sync: updating %d video nodes', updates.length);

            const updateNodeData = useCanvasStore.getState().updateNodeData;
            for (const { id, data } of updates) {
                updateNodeData(id, data);
            }
        };

        // Initial sync when canvas opens
        syncFromCache();

        // Subscribe to query cache changes
        const unsubscribe = queryClient.getQueryCache().subscribe((event) => {
            if (event?.query?.queryKey?.[0] === 'videos') {
                syncFromCache();
            }
        });

        return unsubscribe;
    }, [isOpen, user?.uid, currentChannel?.id, queryClient]);
}
