/**
 * GalleryTab
 * 
 * Main container for Visual Gallery - displays uploaded cover images
 * in a grid format similar to Playlist view.
 */

import React, { useState, useRef, useEffect } from 'react';
import type { VideoDetails } from '../../../../core/utils/youtubeApi';
import { useGallery } from '../../hooks/useGallery';
import { useChannelStore } from '../../../../core/stores/channelStore';
import { GalleryHeader } from './GalleryHeader';
import { GalleryUploadZone } from './GalleryUploadZone';
import { GalleryGrid } from './GalleryGrid';
import { GalleryZoomControls } from './GalleryZoomControls';
import { getGalleryZoomLevel } from './galleryZoomUtils';

interface GalleryTabProps {
    video: VideoDetails;
}

export const GalleryTab: React.FC<GalleryTabProps> = ({ video }) => {
    const { currentChannel } = useChannelStore();
    const sentinelRef = useRef<HTMLDivElement>(null);
    const [isScrolled, setIsScrolled] = useState(false);

    // Gallery state and actions
    const gallery = useGallery({
        videoId: video.id,
        initialItems: video.galleryItems || []
    });

    // Update items when video prop changes (avoid duplicates from optimistic updates)
    useEffect(() => {
        const newItems = video.galleryItems || [];
        // Only sync if server data has items we don't have locally
        // This prevents duplication from optimistic updates
        const localIds = new Set(gallery.items.map(i => i.id));
        const serverHasNewItems = newItems.some(item => !localIds.has(item.id));
        const localHasExtraItems = gallery.items.some(item => !newItems.find(ni => ni.id === item.id));

        if (serverHasNewItems || localHasExtraItems) {
            gallery.setItems(newItems);
        }
    }, [video.galleryItems]); // eslint-disable-line react-hooks/exhaustive-deps

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

        // Upload each file
        for (const file of Array.from(files)) {
            await gallery.uploadImage(file);
        }

        // Reset input
        e.target.value = '';
    };

    const hasItems = gallery.items.length > 0;

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
                itemCount={gallery.items.length}
                sortMode={gallery.sortMode}
                onSortChange={gallery.setSortMode}
                onUploadClick={handleUploadClick}
                isScrolled={isScrolled}
            />

            {/* Content */}
            <div className="p-6 flex-1 flex flex-col">
                {/* Empty state / Upload zone (only when no items) */}
                {!hasItems && !gallery.isUploading && (
                    <GalleryUploadZone onUpload={gallery.uploadImage} />
                )}

                {/* Gallery Grid - show when has items OR uploading (for placeholder card) */}
                {(gallery.sortedItems.length > 0 || gallery.isUploading) && (
                    <GalleryGrid
                        items={gallery.sortedItems}
                        channelTitle={currentChannel?.name || ''}
                        channelAvatar={currentChannel?.avatar || ''}
                        zoomLevel={zoomLevel}
                        sortMode={gallery.sortMode}
                        onDelete={gallery.removeImage}
                        onDownload={gallery.downloadOriginal}
                        onToggleLike={gallery.toggleLike}
                        onReorder={gallery.reorderItems}
                        onUpload={gallery.uploadImage}
                        isUploading={gallery.isUploading}
                        uploadingFilename={gallery.uploadingFilename}
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
        </div>
    );
};
