import React, { useState, useMemo, useEffect } from 'react';
import { Check, Home, Loader2, Trash2 } from 'lucide-react';
import type { TrafficSource } from '@/core/types/traffic';
import { useAuth } from '@/core/hooks/useAuth';
import { useTrafficNicheStore } from '@/core/stores/useTrafficNicheStore';
import { useChannelStore } from '@/core/stores/channelStore';

import { useUIStore } from '@/core/stores/uiStore';
import { VideoService } from '@/core/services/videoService';
import { TrafficNicheSelector } from './Niches/TrafficNicheSelector';
import { TrafficPlaylistSelector } from './TrafficPlaylistSelector';
import { FloatingBar } from '@/components/Shared/FloatingBar';
import { PortalTooltip } from '@/components/Shared/PortalTooltip';
import { fetchVideosBatch } from '@/core/utils/youtubeApi';
import { useSettings } from '@/core/hooks/useSettings';
import type { VideoDetails } from '@/core/utils/youtubeApi';
import { logger } from '@/core/utils/logger';

interface TrafficFloatingBarProps {
    videos: TrafficSource[];
    homeVideos: VideoDetails[];
    position: { x: number; y: number };
    onClose: () => void;
    isDocked?: boolean;
    dockingStrategy?: 'absolute' | 'fixed' | 'sticky';
}

export const TrafficFloatingBar: React.FC<TrafficFloatingBarProps> = ({
    videos,
    homeVideos,
    position,
    onClose,
    isDocked = false,
    dockingStrategy = 'sticky'
}) => {
    const { user } = useAuth();
    const { currentChannel } = useChannelStore();
    const { showToast } = useUIStore();
    const { generalSettings } = useSettings();
    const { niches, assignments, addTrafficNiche, assignVideoToTrafficNiche, removeVideoFromTrafficNiche } = useTrafficNicheStore();

    // State
    const [activeMenu, setActiveMenu] = useState<'niche' | 'playlist' | null>(null);
    const [isProcessing, setIsProcessing] = useState(false);

    const isMultiSelect = videos.length > 1;
    const shouldDock = isMultiSelect || isDocked;

    // Handle clicks outside
    React.useEffect(() => {
        const handleOutsideClick = () => {
            // If the click reaches document, it's outside.
            if (activeMenu) {
                setActiveMenu(null);
            } else if (!isMultiSelect) {
                onClose();
            }
        };

        // Use a small timeout to avoid catching the click that mounted this component
        const timerId = setTimeout(() => {
            document.addEventListener('click', handleOutsideClick);
        }, 0);

        return () => {
            clearTimeout(timerId);
            document.removeEventListener('click', handleOutsideClick);
        };
    }, [activeMenu, isMultiSelect, onClose]);

    // Keyboard
    React.useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                if (activeMenu) {
                    e.stopPropagation();
                    setActiveMenu(null);
                } else {
                    onClose();
                }
            }
        };
        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [activeMenu, onClose]);

    // Smart Positioning Logic moved to FloatingBar
    // "Add to Home" Logic
    const areAllAddedToHome = useMemo(() => {
        // Only videos with valid IDs can be checked
        return videos
            .filter(v => v.videoId)
            .every(v => homeVideos.some(hv => hv.id === v.videoId && !hv.isPlaylistOnly));
    }, [homeVideos, videos]);

    // --- Keyboard Shortcuts ---
    useEffect(() => {
        // The FloatingBar is always "open" when rendered, so no need for an `isOpen` check here.

        const handleKeyDown = (e: KeyboardEvent) => {
            // Check if user is typing in an input
            const target = e.target as HTMLElement;
            if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
                return;
            }

            if (e.key === 'Enter') {
                // Prevent default if it might submit a form, though usually detached
                e.preventDefault();

                // Only open if selectors aren't already open
                if (activeMenu === null) { // Check if no menu is currently active
                    setActiveMenu('niche'); // Open the Niche Selector
                }
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [activeMenu]); // Depend on activeMenu to re-evaluate if a menu is open

    const handleHomeToggle = async () => {
        // Prevent double-clicks silently (no visual feedback to keep UI feeling light)
        if (isProcessing || !user || !currentChannel) return;

        setIsProcessing(true);
        try {
            const validVideos = videos.filter(v => v.videoId);
            if (validVideos.length === 0) return;

            const shouldAdd = !areAllAddedToHome;

            if (shouldAdd) {
                // Filter videos that clearly need adding
                const videosToAdd = validVideos.filter(v => !homeVideos.some(hv => hv.id === v.videoId && !hv.isPlaylistOnly));
                const videoIds = videosToAdd.map(v => v.videoId!);

                let addedCount = 0;
                let quotaUsed = 0;

                // Batch fetch details (chunk of 50)
                const BATCH_SIZE = 50;
                const chunks: string[][] = [];
                for (let i = 0; i < videoIds.length; i += BATCH_SIZE) {
                    chunks.push(videoIds.slice(i, i + BATCH_SIZE));
                }

                // We need the API key from settings or store. Assuming it's available via useChannelStore or similar.
                // Actually, current implementation of youtubeApi usually passes key from caller.
                // Let's check where to get apiKey. Usually useAuth or useSettings.
                // Checking previous context: VideoService doesn't expose it.
                // Let's try to get it from settings if possible, or skip if unavailable (fallback).
                // Actually, let's assume we can get it or fail gracefully.
                // WAIT: The user specifically asked to fetch info.
                // I need the API Key. `useSettingsStore`?
                // Let's look at `useTrendStore` or `useChannelStore`.
                // If I can't find it, I'll have to rely on what I have.
                // But wait, `VideoService` adds video. The `fetchVideosBatch` requires apiKey.
                // I'll grab it from localStorage for now as a fallback or check stores.
                // Or better: `currentChannel` might have it? No.
                // Let's assume `useSettingsStore` has it.

                // For now, I will write the logic assuming I can get the key.
                // If not, I'll use a placeholder and user might need to fix.
                // Actually, `useSettingsStore` is the standard way.

                const apiKey = generalSettings.apiKey;
                if (!apiKey) {
                    showToast('YouTube API Key not found. Please add it in settings.', 'error');
                    return;
                }

                const fetchedDetailsMap = new Map<string, VideoDetails>();

                for (const chunk of chunks) {
                    try {
                        const details = await fetchVideosBatch(chunk, apiKey);
                        details.forEach(d => fetchedDetailsMap.set(d.id, d));
                        quotaUsed += 2; // 1 for videos, 1 for channels
                    } catch (err: unknown) {
                        const error = err instanceof Error ? err : new Error('Unknown error');
                        logger.warn('Failed to fetch batch details', { component: 'TrafficFloatingBar', error });
                        showToast('Failed to fetch video details from YouTube', 'error');
                        return;
                    }
                }

                await Promise.all(videosToAdd.map(async (v) => {
                    const fetched = fetchedDetailsMap.get(v.videoId!);

                    // Construct Video Data
                    const videoPayload = {
                        id: v.videoId!,
                        title: fetched?.title || v.sourceTitle,
                        thumbnail: fetched?.thumbnail || v.thumbnail || '',
                        channelId: fetched?.channelId || '',
                        channelTitle: fetched?.channelTitle || v.channelTitle || '',
                        channelAvatar: fetched?.channelAvatar || '',
                        viewCount: fetched?.viewCount || v.views.toString(),
                        publishedAt: fetched?.publishedAt || v.publishedAt || new Date().toISOString(),
                        duration: fetched?.duration, // Optional

                        isPlaylistOnly: false,
                        createdAt: Date.now(),
                        addedToHomeAt: Date.now()
                    };

                    await VideoService.addVideo(user.uid, currentChannel!.id, videoPayload);
                    addedCount++;
                }));

                // Show quota usage in toast
                const message = isMultiSelect
                    ? `${addedCount} videos added to Home (${quotaUsed} quota used)`
                    : `Added to Home (${quotaUsed} quota used)`;
                showToast(message, 'success');
            } else {
                // Remove all
                await Promise.all(validVideos.map(async (v) => {
                    if (v.videoId) {
                        await VideoService.deleteVideo(user.uid, currentChannel!.id, v.videoId);
                    }
                }));
                showToast(isMultiSelect ? 'Removed from Home' : 'Removed from Home', 'success');
            }
        } catch (e: unknown) {
            const error = e instanceof Error ? e : new Error('Unknown error');
            logger.error('Failed to update Home', { component: 'TrafficFloatingBar', error });
            showToast('Failed to update Home', 'error');
        } finally {
            setIsProcessing(false);
        }
    };

    // Check if videos are already in Trash
    const { isInTrash } = useMemo(() => {
        const trashNiche = niches.find(n => n.name.trim().toLowerCase() === 'trash');
        if (!trashNiche) return { isInTrash: false, trashNicheId: null };

        const validVidIds = videos.map(v => v.videoId).filter(Boolean);
        if (validVidIds.length === 0) return { isInTrash: false, trashNicheId: trashNiche.id };

        // Check if ALL valid videos are assigned to the trash niche
        const allInTrash = validVidIds.every(vidId =>
            assignments.some(a => a.videoId === vidId && a.nicheId === trashNiche.id)
        );

        return {
            isInTrash: allInTrash,
            trashNicheId: trashNiche.id
        };
    }, [niches, videos, assignments]);

    const handleTrash = async () => {
        if (!user || !currentChannel) return;
        setIsProcessing(true);
        try {
            // Find or create 'Trash' niche (robust check)
            const trashNiche = niches.find(n => n.name.trim().toLowerCase() === 'trash');
            let targetNicheId = trashNiche?.id;

            if (!targetNicheId) {
                const newId = crypto.randomUUID();
                await addTrafficNiche({
                    id: newId,
                    name: 'Trash',
                    channelId: currentChannel.id,
                    color: '#ef4444' // Red color for trash
                }, user.uid, currentChannel.id);
                targetNicheId = newId;
            }

            const validVideos = videos.filter(v => v.videoId);

            // Check current status based on latest data at click time
            // Re-fetch assignments from store (or rely on updated props if reactive)
            // But we can check `isInTrash` computed value if we fix the hook usage.

            if (isInTrash && targetNicheId) {
                // REMOVE from Trash
                await Promise.all(validVideos.map(async (v) => {
                    if (v.videoId) {
                        await removeVideoFromTrafficNiche(v.videoId, targetNicheId!, user.uid, currentChannel!.id);
                    }
                }));
                showToast('Restored from Trash', 'success');
            } else {
                // ADD to Trash
                await Promise.all(validVideos.map(async (v) => {
                    if (v.videoId) {
                        await assignVideoToTrafficNiche(v.videoId, targetNicheId!, user.uid, currentChannel!.id);
                    }
                }));
                showToast('Moved to Trash', 'success');
                onClose();
            }

        } catch (e: unknown) {
            const error = e instanceof Error ? e : new Error('Unknown error');
            logger.error('Failed to update trash status', { component: 'TrafficFloatingBar', error });
            showToast('Failed to update trash status', 'error');
        } finally {
            setIsProcessing(false);
        }
    };

    const title = isMultiSelect ? `${videos.length} selected` : (videos[0]?.sourceTitle || 'Selected Video');

    return (
        <FloatingBar
            title={title}
            position={position}
            onClose={onClose}
            isDocked={isDocked || shouldDock}
            dockingStrategy={dockingStrategy}
        >
            {({ openAbove }) => (
                <>
                    {/* Niche Selector Container */}
                    <div className="relative">
                        <TrafficNicheSelector
                            videoIds={videos.map(v => v.videoId!).filter(Boolean)}
                            isOpen={activeMenu === 'niche'}
                            openAbove={openAbove}
                            onToggle={() => setActiveMenu(activeMenu === 'niche' ? null : 'niche')}
                            onClose={() => setActiveMenu(null)}
                            onSelectionClear={onClose}
                        />
                    </div>

                    {/* Separator */}
                    <div className="w-px h-4 bg-white/10 mx-1" />

                    {/* Home Button with Premium Tooltip and Pulse Animation */}
                    <PortalTooltip
                        content={<span className="text-xs">{areAllAddedToHome ? 'Remove from Home' : 'Add to Home'}</span>}
                        side="top"
                        align="center"
                        variant="glass"
                        enterDelay={400}
                    >
                        <button
                            onClick={handleHomeToggle}
                            className={`relative p-1.5 rounded-full transition-colors duration-150 ${!isProcessing && areAllAddedToHome
                                ? 'text-white hover:bg-red-500/20 hover:text-red-300'
                                : 'text-text-secondary hover:text-white hover:bg-white/10'
                                }`}
                        >
                            {isProcessing ? (
                                <Loader2 size={16} className="animate-spin text-white" />
                            ) : (
                                <>
                                    <Home size={16} />
                                    {areAllAddedToHome && (
                                        <div className="absolute -top-0.5 -right-0.5 w-3 h-3 bg-green-500 rounded-full flex items-center justify-center shadow-sm">
                                            <Check size={8} className="text-white" strokeWidth={3} />
                                        </div>
                                    )}
                                </>
                            )}
                        </button>
                    </PortalTooltip>

                    <TrafficPlaylistSelector
                        videos={videos}
                        homeVideos={homeVideos}
                        isOpen={activeMenu === 'playlist'}
                        openAbove={openAbove}
                        onToggle={() => setActiveMenu(activeMenu === 'playlist' ? null : 'playlist')}
                    />

                    {/* Trash Button */}
                    <PortalTooltip
                        content={<span className="text-xs">{isInTrash ? 'Restore from Trash' : 'Move to Trash'}</span>}
                        side="top"
                        align="center"
                        variant="glass"
                        enterDelay={400}
                    >
                        <button
                            onClick={handleTrash}
                            disabled={isProcessing}
                            className={`p-1.5 rounded-full transition-colors duration-150 disabled:opacity-50
                                ${isInTrash
                                    ? 'text-red-400 bg-red-500/10 hover:bg-red-500/20'
                                    : 'text-text-secondary hover:text-red-400 hover:bg-white/10'
                                }
                            `}
                        >
                            {isProcessing ? (
                                <Loader2 size={16} className="animate-spin" />
                            ) : (
                                <Trash2 size={16} className={isInTrash ? "fill-red-400/20" : ""} />
                            )}
                        </button>
                    </PortalTooltip>
                </>
            )}
        </FloatingBar>
    );
};
