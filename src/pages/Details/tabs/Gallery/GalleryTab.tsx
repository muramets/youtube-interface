/**
 * GalleryTab
 * 
 * Main container for Visual Gallery - displays uploaded cover images
 * in a grid format similar to Playlist view.
 */

import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import type { VideoDetails } from '../../../../core/utils/youtubeApi';
import type { GalleryItem } from '../../../../core/types/gallery';
import { useGallery } from '../../hooks/useGallery';
import { useChannelStore } from '../../../../core/stores/channelStore';
import { GalleryHeader } from './GalleryHeader';
import { GalleryUploadZone } from './GalleryUploadZone';
import { GalleryGrid } from './GalleryGrid';
import { GalleryZoomControls } from './GalleryZoomControls';
import { getGalleryZoomLevel } from './galleryZoomUtils';
import { SourceModal } from '../../Sidebar/Gallery/SourceModal';
import { useGalleryCardActions } from './useGalleryCardActions';
import { SelectPlaylistModal } from '../../../../features/Playlists/modals/SelectPlaylistModal';
import { usePickTheWinner } from '../../../../features/Playlists/hooks/usePickTheWinner';
import { useRankings } from '../../../../features/Playlists/hooks/usePlaylistRankings';
import { PickTheWinnerBar } from '../../../../features/Playlists/components/PickTheWinnerBar';
import { useAuth } from '../../../../core/hooks/useAuth';
import { useSettings } from '../../../../core/hooks/useSettings';
import { useVideoSelection } from '../../../../features/Video/hooks/useVideoSelection';
import { FloatingBar } from '../../../../components/ui/organisms/FloatingBar';
import { ConfirmationModal } from '../../../../components/ui/organisms/ConfirmationModal';
import { PortalTooltip } from '../../../../components/ui/atoms/PortalTooltip';
import { Trophy, Trash2, Check, Eye, EyeOff, Clock, ListPlus } from 'lucide-react';

interface GalleryTabProps {
    video: VideoDetails;
    activeSourceId: string | null;
    onSourceChange: (sourceId: string | null) => void;
    isAddSourceModalOpen: boolean;
    onCloseAddSourceModal: () => void;
    // Callbacks to expose gallery methods to parent (for sidebar actions and DndProvider)
    onRegisterDeleteSource?: (handler: (sourceId: string) => Promise<void>) => void;
    onRegisterUpdateSource?: (handler: (sourceId: string, data: { type?: import('../../../../core/types/gallery').GallerySourceType; label?: string; url?: string }) => Promise<void>) => void;
    onRegisterMoveItem?: (handler: (itemId: string, newSourceId: string) => Promise<void>) => void;
    onRegisterReorder?: (handler: (items: GalleryItem[]) => Promise<void>) => void;
    onRegisterItems?: (items: GalleryItem[]) => void;
}

export const GalleryTab: React.FC<GalleryTabProps> = ({
    video,
    activeSourceId,
    onSourceChange,
    isAddSourceModalOpen,
    onCloseAddSourceModal,
    onRegisterDeleteSource,
    onRegisterUpdateSource,
    onRegisterMoveItem,
    onRegisterReorder,
    onRegisterItems
}) => {
    const { currentChannel } = useChannelStore();
    const { user } = useAuth();
    const { pickerSettings } = useSettings();
    const sentinelRef = useRef<HTMLDivElement>(null);
    const [isScrolled, setIsScrolled] = useState(false);
    const [hideLosers, setHideLosers] = useState(false);
    const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

    // Gallery card action handlers
    const {
        handleConvertToVideo,
        handleConvertToVideoInPlaylist,
        handleCloneToHome,
        handleCloneToPlaylist,
        handleSetAsCover,
        isConverting,
        isCloning,
        isSettingCover
    } = useGalleryCardActions(video);

    // Selection mode
    const {
        selectedIds,
        toggleSelection,
        clearSelection,
        isSelectionMode
    } = useVideoSelection();

    // Playlist selection modal state (single or bulk)
    const [pendingAction, setPendingAction] = useState<{
        type: 'convert' | 'clone';
        item?: GalleryItem;
        items?: GalleryItem[];
    } | null>(null);

    // Memoize initial arrays to prevent infinite loops in useGallery useEffect
    const initialItems = React.useMemo(() => video.galleryItems || [], [video.galleryItems]);
    const initialSources = React.useMemo(() => video.gallerySources || [], [video.gallerySources]);

    // Gallery state and actions
    const gallery = useGallery({
        videoId: video.id,
        initialItems,
        initialSources
    });

    // Update items when video prop changes (avoid duplicates from optimistic updates)
    useEffect(() => {
        const newItems = video.galleryItems || [];

        const localIds = new Set(gallery.items.map(i => i.id));
        const serverIds = new Set(newItems.map(i => i.id));

        const serverHasNewItems = newItems.some(item => !localIds.has(item.id));

        // Items we have locally that are NOT on server
        const extraLocalItems = gallery.items.filter(item => !serverIds.has(item.id));

        // Check if any extra local items are "pending/optimistic" (uploaded < 60s ago)
        // This prevents wiping out items we just added but haven't saved/synced yet
        const hasOptimisticItems = extraLocalItems.some(item => (Date.now() - item.uploadedAt) < 60000);

        if (serverHasNewItems || extraLocalItems.length > 0) {
            if (hasOptimisticItems) {
                // SMART MERGE: Server items + Optimistic items
                // We accept server state (including deletions of old items) 
                // BUT we force-keep our fresh optimistic items
                const optimisticItems = extraLocalItems.filter(item => (Date.now() - item.uploadedAt) < 60000);

                console.log('[GallerySync] Merging optimistic items:', optimisticItems.length);

                // Combine and deduplicate just in case
                const merged = [...newItems];
                optimisticItems.forEach(optItem => {
                    if (!merged.find(m => m.id === optItem.id)) {
                        merged.push(optItem);
                    }
                });

                gallery.setItems(merged);
            } else {
                // No optimistic stuff, trust server state 100% (syncs remote deletions)
                console.log('[GallerySync] syncing to server (no optimistic)');
                gallery.setItems(newItems);
            }
        }
    }, [video.galleryItems]); // eslint-disable-line react-hooks/exhaustive-deps

    // Sync activeSourceId from Layout with hook
    const { setActiveSourceId } = gallery;
    useEffect(() => {
        if (activeSourceId !== gallery.activeSourceId) {
            setActiveSourceId(activeSourceId);
        }
    }, [activeSourceId, gallery.activeSourceId, setActiveSourceId]);

    // Sync sources from video prop
    useEffect(() => {
        const newSources = video.gallerySources || [];
        // Only sync if structural changes (add/remove) to avoid reverting optimistic label/url changes
        // or if we have no sources locally yet.
        const localSourceIds = new Set(gallery.sources.map(s => s.id));
        const serverHasNew = newSources.some(s => !localSourceIds.has(s.id));
        const localHasExtra = gallery.sources.some(s => !newSources.find(ns => ns.id === s.id));

        // Also force sync if initial load (empty local)
        const isInitialLoad = gallery.sources.length === 0 && newSources.length > 0;

        if (serverHasNew || localHasExtra || isInitialLoad) {
            gallery.setSources(newSources);
        }
    }, [video.gallerySources]); // eslint-disable-line react-hooks/exhaustive-deps

    // Register handlers with parent for sidebar actions and DndProvider
    useEffect(() => {
        if (onRegisterDeleteSource) {
            onRegisterDeleteSource(gallery.deleteSource);
        }
        if (onRegisterUpdateSource) {
            onRegisterUpdateSource(gallery.updateSource);
        }
        if (onRegisterMoveItem) {
            onRegisterMoveItem(gallery.moveItemToSource);
        }
        if (onRegisterReorder) {
            onRegisterReorder(gallery.reorderItems);
        }
    }, [gallery.deleteSource, gallery.updateSource, gallery.moveItemToSource, gallery.reorderItems, onRegisterDeleteSource, onRegisterUpdateSource, onRegisterMoveItem, onRegisterReorder]);

    // Scroll detection for sticky header shadow
    useEffect(() => {
        const sentinel = sentinelRef.current;
        if (!sentinel) return;

        const observer = new IntersectionObserver(
            ([entry]) => setIsScrolled(!entry.isIntersecting),
            { threshold: 0 }
        );
        observer.observe(sentinel);
        return () => observer.disconnect();
    }, []);

    // Local zoom level state (separate from Home/Playlist)
    const [zoomLevel, setZoomLevel] = useState(getGalleryZoomLevel);

    // File input ref for upload button
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleUploadClick = () => {
        fileInputRef.current?.click();
    };

    const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (!files || files.length === 0) return;

        // Upload all files at once
        await gallery.uploadImages(Array.from(files));

        // Reset input
        e.target.value = '';
    };

    // Handle add source
    const handleAddSource = async (data: { type: import('../../../../core/types/gallery').GallerySourceType; label: string; url?: string }) => {
        const newSource = await gallery.addSource(data);
        if (newSource) {
            onSourceChange(newSource.id);
        }
        onCloseAddSourceModal();
    };

    // Use filteredItems when a source is selected, otherwise show all sorted items
    const baseDisplayedItems = activeSourceId ? gallery.filteredItems : gallery.sortedItems;
    const hasItems = gallery.items.length > 0;

    // ── Pick the Winner ──
    const picker = usePickTheWinner(baseDisplayedItems.length);
    const { rankings, saveRanking, deleteRanking } = useRankings(
        user?.uid || '',
        currentChannel?.id || '',
        `gallery/${video.id}`
    );

    // Detect if viewing a saved ranking
    const isViewingRanking = gallery.sortMode.startsWith('ranking-');

    // Apply saved ranking sort (reorder items by ranking.videoOrder)
    const rankedDisplayedItems = useMemo(() => {
        if (!isViewingRanking) return baseDisplayedItems;
        const ranking = rankings.find(r => r.id === gallery.sortMode);
        if (!ranking) return baseDisplayedItems;

        // Apply ranking order, gracefully skipping deleted items
        const itemMap = new Map(baseDisplayedItems.map(item => [item.id, item]));
        const ordered = ranking.videoOrder
            .map(id => itemMap.get(id))
            .filter((item): item is NonNullable<typeof item> => item !== undefined);

        // Add any items not in the ranking (new additions) at the end
        const rankedSet = new Set(ranking.videoOrder);
        const unranked = baseDisplayedItems.filter(item => !rankedSet.has(item.id));

        return [...ordered, ...unranked];
    }, [baseDisplayedItems, isViewingRanking, rankings, gallery.sortMode]);

    // Apply hide losers filter
    const displayedItems = useMemo(() => {
        if (!hideLosers || !isViewingRanking) return rankedDisplayedItems;
        return rankedDisplayedItems.slice(0, pickerSettings.winnerCount);
    }, [rankedDisplayedItems, hideLosers, isViewingRanking, pickerSettings.winnerCount]);

    // Ranking overlay getter
    const getRankingOverlay = useCallback((itemId: string): number | null => {
        if (!picker.isActive) return null;
        return picker.getRank(itemId);
    }, [picker]);

    // Sort change handler with pick-winner support
    const handleSortChange = useCallback((val: string) => {
        if (val === 'pick-winner') {
            picker.activate();
            return;
        }
        if (picker.isActive) {
            picker.deactivate();
        }
        gallery.setSortMode(val as import('../../../../core/types/gallery').GallerySortMode);
    }, [picker, gallery]);

    // Save ranking handler
    const handleSaveRanking = useCallback((name: string) => {
        saveRanking(name, picker.rankedVideoIds);
        picker.deactivate();
    }, [saveRanking, picker]);

    // Custom section for SortButton
    const sortCustomSection = useMemo(() => (
        <>
            <div className="border-t border-[#333333] mt-1 pt-1">
                <button
                    onClick={() => handleSortChange('pick-winner')}
                    className={`w-full text-left px-3 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors border-none cursor-pointer ${picker.isActive ? 'bg-amber-500/20 text-amber-300' : 'text-[#AAAAAA] hover:bg-[#161616] hover:text-white bg-transparent'}`}
                >
                    <Trophy size={14} />
                    Pick the Winner
                </button>
            </div>
            {rankings.length > 0 && (
                <div className="border-t border-[#333333] mt-1 pt-1">
                    <div className="px-3 py-1.5 text-xs font-bold text-[#666666] uppercase tracking-wider">
                        Saved Rankings
                    </div>
                    {rankings.map(ranking => (
                        <button
                            key={ranking.id}
                            onClick={() => handleSortChange(ranking.id)}
                            className={`group/ranking w-full text-left px-3 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors border-none cursor-pointer ${gallery.sortMode === ranking.id
                                ? 'bg-[#333333] text-white'
                                : 'text-[#AAAAAA] hover:bg-[#161616] hover:text-white bg-transparent'
                                }`}
                        >
                            <Trophy size={14} className="text-amber-400 flex-shrink-0" />
                            <span className="truncate flex-1">{ranking.name}</span>
                            <span className="relative flex-shrink-0 w-[22px] h-[22px] flex items-center justify-center">
                                {gallery.sortMode === ranking.id && (
                                    <Check size={14} className="transition-opacity group-hover/ranking:opacity-0" />
                                )}
                                <span
                                    role="button"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        deleteRanking(ranking.id);
                                    }}
                                    className="absolute inset-0 flex items-center justify-center rounded-md text-text-tertiary hover:text-red-400 hover:bg-red-500/10 transition-all opacity-0 group-hover/ranking:opacity-100"
                                >
                                    <Trash2 size={14} />
                                </span>
                            </span>
                        </button>
                    ))}
                </div>
            )}
        </>
    ), [picker.isActive, rankings, gallery.sortMode, handleSortChange, deleteRanking]);

    // Register current items with parent for DndProvider
    useEffect(() => {
        if (onRegisterItems) {
            onRegisterItems(displayedItems);
        }
    }, [displayedItems, onRegisterItems]);

    return (
        <div className="flex-1 overflow-y-auto custom-scrollbar relative flex flex-col">
            <div ref={sentinelRef} className="h-0" />

            {/* Hidden file input */}
            <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={handleFileSelect}
            />

            {/* Sticky Header */}
            <GalleryHeader
                itemCount={displayedItems.length}
                subtitle={activeSourceId
                    ? `Viewing images for ${gallery.sources.find(s => s.id === activeSourceId)?.label || 'Unknown Source'}`
                    : 'Viewing all images'
                }
                sortMode={gallery.sortMode}
                onSortChange={handleSortChange}
                onUploadClick={handleUploadClick}
                isScrolled={isScrolled}
                customSection={sortCustomSection}
                actions={isViewingRanking ? (
                    <>
                        <PortalTooltip enterDelay={500} content={hideLosers ? 'Show all images' : `Hide all except top ${pickerSettings.winnerCount}`}>
                            <button
                                onClick={() => setHideLosers(prev => !prev)}
                                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors border-none cursor-pointer flex items-center gap-1.5 ${hideLosers
                                    ? 'bg-amber-500/20 text-amber-300'
                                    : 'bg-white/10 hover:bg-white/20 text-white'
                                    }`}
                            >
                                {hideLosers ? <EyeOff size={14} /> : <Eye size={14} />}
                                {hideLosers ? 'Show All' : 'Hide Losers'}
                            </button>
                        </PortalTooltip>
                        <PortalTooltip enterDelay={500} content={`Delete images ranked below top ${pickerSettings.winnerCount}`}>
                            <button
                                onClick={() => setDeleteConfirmOpen(true)}
                                className="px-3 py-1.5 rounded-md text-sm font-medium transition-colors border-none cursor-pointer flex items-center gap-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400"
                            >
                                <Trash2 size={14} />
                                Clean Up Losers
                            </button>
                        </PortalTooltip>
                    </>
                ) : undefined}
            />

            {/* Content - DndContext provided by parent Layout */}
            <div className={`px-6 pb-6 ${picker.isActive ? 'pt-3' : 'pt-6'} flex-1 flex flex-col`}>
                {/* Pick the Winner Bar */}
                {picker.isActive && (
                    <PickTheWinnerBar
                        ranked={picker.progress.ranked}
                        total={picker.progress.total}
                        canSave={picker.canSave}
                        onSave={handleSaveRanking}
                        onDiscard={picker.deactivate}
                    />
                )}
                {/* Empty state / Upload zone (when no visible items) */}
                {displayedItems.length === 0 && !gallery.isUploading && (
                    <GalleryUploadZone
                        onUpload={gallery.uploadImages}
                        title={activeSourceId
                            ? `Add images to ${gallery.sources.find(s => s.id === activeSourceId)?.label || 'Source'}`
                            : 'Upload Cover Variations'
                        }
                        description={activeSourceId
                            ? "Drag and drop images here to add them to this source"
                            : undefined
                        }
                    />
                )}

                {/* Gallery Grid - show when has items OR uploading (for placeholder card) */}
                {(displayedItems.length > 0 || gallery.isUploading) && (
                    <GalleryGrid
                        items={displayedItems}
                        channelTitle={currentChannel?.name || ''}
                        channelAvatar={currentChannel?.avatar || ''}
                        zoomLevel={zoomLevel}
                        onDelete={gallery.removeImage}
                        onDownload={gallery.downloadOriginal}
                        onRate={gallery.rateImage}
                        onUploadFiles={gallery.uploadImages}
                        uploadingFiles={gallery.uploadingFiles}
                        onItemImageLoaded={gallery.onItemImageLoaded}
                        onConvertToVideo={handleConvertToVideo}
                        onConvertToVideoInPlaylist={(item) => setPendingAction({ type: 'convert', item })}
                        onCloneToHome={handleCloneToHome}
                        onCloneToPlaylist={(item) => setPendingAction({ type: 'clone', item })}
                        onSetAsCover={video.id.startsWith('custom-') ? handleSetAsCover : undefined}
                        isConverting={isConverting}
                        isCloning={isCloning}
                        isSettingCover={isSettingCover}
                        onItemClick={picker.isActive ? picker.handleVideoClick : undefined}
                        getRankingOverlay={picker.isActive ? getRankingOverlay : undefined}
                        selectedIds={!picker.isActive ? selectedIds : undefined}
                        onToggleSelection={!picker.isActive ? toggleSelection : undefined}
                        isSelectionMode={!picker.isActive ? isSelectionMode : false}
                    />
                )}
            </div>

            {/* Floating Zoom Controls (only when there are items) */}
            {hasItems && (
                <GalleryZoomControls
                    value={zoomLevel}
                    onChange={setZoomLevel}
                />
            )}

            {/* Selection Floating Bar */}
            {selectedIds.size >= 2 && (
                <FloatingBar
                    title={`${selectedIds.size} selected`}
                    position={{ x: 0, y: 0 }}
                    onClose={clearSelection}
                    isDocked={true}
                    dockingStrategy="fixed"
                >
                    {() => (
                        <div className="flex items-center gap-1">
                            <PortalTooltip enterDelay={500} content="Clone to Home Page">
                                <button
                                    onClick={async () => {
                                        const items = gallery.items.filter(i => selectedIds.has(i.id));
                                        if (items.length > 0) {
                                            clearSelection();
                                            for (const item of items) {
                                                await handleCloneToHome(item);
                                            }
                                        }
                                    }}
                                    className="p-2 hover:bg-white/10 text-white rounded-full transition-colors border-none cursor-pointer flex items-center justify-center"
                                >
                                    <Clock size={20} />
                                </button>
                            </PortalTooltip>
                            <PortalTooltip enterDelay={500} content="Clone to Playlist">
                                <button
                                    onClick={() => {
                                        const items = gallery.items.filter(i => selectedIds.has(i.id));
                                        if (items.length > 0) {
                                            setPendingAction({ type: 'clone', items });
                                        }
                                    }}
                                    className="p-2 hover:bg-white/10 text-white rounded-full transition-colors border-none cursor-pointer flex items-center justify-center"
                                >
                                    <ListPlus size={20} />
                                </button>
                            </PortalTooltip>
                            <PortalTooltip enterDelay={500} content="Delete selected">
                                <button
                                    onClick={async () => {
                                        const itemsToDelete = gallery.items.filter(i => selectedIds.has(i.id));
                                        if (itemsToDelete.length > 0) {
                                            clearSelection();
                                            gallery.removeImages(itemsToDelete);
                                        }
                                    }}
                                    className="p-2 hover:bg-red-500/10 text-red-500 rounded-full transition-colors border-none cursor-pointer flex items-center justify-center"
                                >
                                    <Trash2 size={20} />
                                </button>
                            </PortalTooltip>
                        </div>
                    )}
                </FloatingBar>
            )}

            {/* Add Source Modal */}
            <SourceModal
                isOpen={isAddSourceModalOpen}
                onClose={onCloseAddSourceModal}
                onSave={handleAddSource}
                mode="add"
            />

            {/* Playlist Selection Modal for "in Playlist" actions */}
            <SelectPlaylistModal
                isOpen={pendingAction !== null}
                onClose={() => setPendingAction(null)}
                onSelect={async (playlistId, playlistName) => {
                    if (pendingAction) {
                        const action = pendingAction;
                        setPendingAction(null);
                        clearSelection();

                        // Bulk items (from floating bar)
                        if (action.items) {
                            for (const item of action.items) {
                                if (action.type === 'convert') {
                                    await handleConvertToVideoInPlaylist(item, playlistId, playlistName);
                                } else {
                                    await handleCloneToPlaylist(item, playlistId, playlistName);
                                }
                            }
                        } else if (action.item) {
                            // Single item (from card menu)
                            if (action.type === 'convert') {
                                await handleConvertToVideoInPlaylist(action.item, playlistId, playlistName);
                            } else {
                                await handleCloneToPlaylist(action.item, playlistId, playlistName);
                            }
                        }
                    }
                }}
                title={pendingAction?.type === 'convert' ? 'Save video to playlist' : 'Save clone to playlist'}
            />

            {/* Clean Up Losers Confirmation Modal */}
            <ConfirmationModal
                isOpen={deleteConfirmOpen}
                onClose={() => setDeleteConfirmOpen(false)}
                onConfirm={async () => {
                    const ranking = rankings.find(r => r.id === gallery.sortMode);
                    if (!ranking) return;
                    const winnerIds = new Set(ranking.videoOrder.slice(0, pickerSettings.winnerCount));
                    const loserItems = gallery.items.filter(item => !winnerIds.has(item.id));

                    // Optimistic: hide & close immediately
                    setHideLosers(true);
                    setDeleteConfirmOpen(false);

                    // Fire-and-forget deletions in background
                    if (loserItems.length > 0) {
                        gallery.removeImages(loserItems);
                    }
                }}
                title="Clean Up Losers"
                message={<>
                    <p>Images ranked below top {pickerSettings.winnerCount} will be <strong>permanently deleted</strong> from the gallery.</p>
                </>}
                confirmLabel="Delete"
            />
        </div>
    );
};
