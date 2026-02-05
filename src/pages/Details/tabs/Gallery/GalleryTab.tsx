/**
 * GalleryTab
 * 
 * Main container for Visual Gallery - displays uploaded cover images
 * in a grid format similar to Playlist view.
 */

import React, { useState, useRef, useEffect } from 'react';
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
import { SelectPlaylistModal } from '../../../../features/Playlist/SelectPlaylistModal';

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
    const sentinelRef = useRef<HTMLDivElement>(null);
    const [isScrolled, setIsScrolled] = useState(false);

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

    // Playlist selection modal state
    const [pendingAction, setPendingAction] = useState<{
        type: 'convert' | 'clone';
        item: GalleryItem;
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
    const displayedItems = activeSourceId ? gallery.filteredItems : gallery.sortedItems;
    const hasItems = gallery.items.length > 0;

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
                onSortChange={gallery.setSortMode}
                onUploadClick={handleUploadClick}
                isScrolled={isScrolled}
            />

            {/* Content - DndContext provided by parent Layout */}
            <div className="p-6 flex-1 flex flex-col">
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
                        onConvertToVideo={handleConvertToVideo}
                        onConvertToVideoInPlaylist={(item) => setPendingAction({ type: 'convert', item })}
                        onCloneToHome={handleCloneToHome}
                        onCloneToPlaylist={(item) => setPendingAction({ type: 'clone', item })}
                        onSetAsCover={video.id.startsWith('custom-') ? handleSetAsCover : undefined}
                        isConverting={isConverting}
                        isCloning={isCloning}
                        isSettingCover={isSettingCover}
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
                        // Close modal immediately to avoid UI lag (seeing counter update)
                        const action = pendingAction;
                        setPendingAction(null);

                        // Execute action in background
                        if (action.type === 'convert') {
                            await handleConvertToVideoInPlaylist(action.item, playlistId, playlistName);
                        } else {
                            await handleCloneToPlaylist(action.item, playlistId, playlistName);
                        }
                    }
                }}
                title={pendingAction?.type === 'convert' ? 'Save video to playlist' : 'Save clone to playlist'}
            />
        </div>
    );
};
