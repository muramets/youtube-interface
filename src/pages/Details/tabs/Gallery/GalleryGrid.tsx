/**
 * GalleryGrid
 * 
 * Grid container for gallery items with drag-and-drop support
 * for custom ordering. Also acts as a drop zone for file uploads.
 * 
 * Note: DndContext is provided by parent GalleryDndProvider.
 * This component only uses SortableContext for reordering.
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
    SortableContext,
    rectSortingStrategy
} from '@dnd-kit/sortable';
import { Loader2 } from 'lucide-react';
import type { GalleryItem } from '../../../../core/types/gallery';
import type { UploadingFile } from '../../hooks/useGallery';
import { GalleryCard } from './GalleryCard';
import { useGalleryLayout } from './GalleryLayoutContext';

interface GalleryGridProps {
    items: GalleryItem[];
    channelTitle: string;
    channelAvatar: string;
    zoomLevel: number;
    onDelete: (item: GalleryItem) => Promise<void>;
    onDownload: (item: GalleryItem) => Promise<void>;
    onToggleLike: (itemId: string) => Promise<void>;
    // File upload props
    onUploadFiles: (files: File[]) => Promise<void>;
    uploadingFiles: UploadingFile[];
}

// Map zoom level to column count
const ZOOM_TO_COLUMNS: Record<number, number> = {
    1: 2,
    2: 3,
    3: 4,
    4: 5,
    5: 6,
};

// Map zoom level to grid class
const ZOOM_TO_GRID_CLASS: Record<number, string> = {
    1: 'grid-cols-2',
    2: 'grid-cols-3',
    3: 'grid-cols-4',
    4: 'grid-cols-5',
    5: 'grid-cols-6',
};

const GRID_GAP = 16; // gap-4 = 1rem = 16px

export const GalleryGrid: React.FC<GalleryGridProps> = ({
    items,
    channelTitle,
    channelAvatar,
    zoomLevel,
    onDelete,
    onDownload,
    onToggleLike,
    onUploadFiles,
    uploadingFiles
}) => {
    // Always enable drag
    const isDragEnabled = true;
    const [isDragOver, setIsDragOver] = useState(false);

    // Ref for container to measure width
    const containerRef = useRef<HTMLDivElement>(null);
    const { setCardWidth } = useGalleryLayout();

    // Calculate and set card width on resize
    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        const calculateCardWidth = () => {
            const containerWidth = container.offsetWidth;
            const columns = ZOOM_TO_COLUMNS[zoomLevel] || 4;
            const totalGap = GRID_GAP * (columns - 1);
            const cardWidth = Math.floor((containerWidth - totalGap) / columns);
            setCardWidth(cardWidth);
        };

        // Initial calculation
        calculateCardWidth();

        // Recalculate on resize
        const resizeObserver = new ResizeObserver(() => {
            calculateCardWidth();
        });
        resizeObserver.observe(container);

        return () => resizeObserver.disconnect();
    }, [zoomLevel, setCardWidth]);

    // File drop handlers
    const handleFileDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.dataTransfer.types.includes('Files')) {
            setIsDragOver(true);
        }
    }, []);

    const handleFileDragLeave = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragOver(false);
    }, []);

    const handleFileDrop = useCallback(async (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragOver(false);

        const files = Array.from(e.dataTransfer.files);
        const imageFiles = files.filter(file => file.type.startsWith('image/'));

        // Upload all image files
        if (imageFiles.length > 0) {
            await onUploadFiles(imageFiles);
        }
    }, [onUploadFiles]);

    // Derived state: is any upload in progress
    const isUploading = uploadingFiles.length > 0;

    return (
        <div
            ref={containerRef}
            className={`relative flex-1 min-h-[400px] rounded-xl transition-all duration-200 ${isDragOver ? 'bg-white/5 ring-2 ring-white/20 ring-dashed' : ''}`}
            onDragOver={handleFileDragOver}
            onDragLeave={handleFileDragLeave}
            onDrop={handleFileDrop}
        >
            <SortableContext
                items={items.map(item => item.id)}
                strategy={rectSortingStrategy}
            >
                <div className={`grid ${ZOOM_TO_GRID_CLASS[zoomLevel] || 'grid-cols-4'} gap-4 content-start`}>
                    {/* Upload Placeholder Cards - one for each uploading file */}
                    {uploadingFiles.map(uploadingFile => (
                        <div key={uploadingFile.id} className="group relative flex flex-col gap-2 p-[6px] rounded-xl isolate">
                            {/* Hover Substrate - always visible for upload card */}
                            <div className="absolute inset-0 rounded-xl -z-10 pointer-events-none bg-white/10 border-2 border-white/20 animate-pulse" />

                            {/* Thumbnail placeholder */}
                            <div className="relative aspect-video rounded-xl overflow-hidden bg-[#1a1a1a] flex items-center justify-center">
                                <div className="flex flex-col items-center gap-2">
                                    <Loader2 size={32} className="text-white/60 animate-spin" />
                                </div>
                            </div>

                            {/* File info - matching GalleryCard structure */}
                            <div className="flex items-start gap-3 px-1">
                                {/* Channel avatar */}
                                <div className="w-9 h-9 rounded-full bg-[#2a2a2a] flex-shrink-0 overflow-hidden">
                                    {channelAvatar && (
                                        <img src={channelAvatar} alt="" className="w-full h-full object-cover" />
                                    )}
                                </div>

                                {/* Text info */}
                                <div className="flex-1 min-w-0">
                                    <div className="text-sm text-text-primary truncate font-medium">
                                        {uploadingFile.filename}
                                    </div>
                                    <div className="text-xs text-text-secondary mt-0.5">
                                        {channelTitle}
                                    </div>
                                    <div className="text-xs text-text-secondary">
                                        {uploadingFile.status === 'pending' ? 'Waiting...' : 'Uploading...'}
                                    </div>
                                </div>
                            </div>
                        </div>
                    ))}

                    {items.map((item) => (
                        <GalleryCard
                            key={item.id}
                            item={item}
                            channelTitle={channelTitle}
                            channelAvatar={channelAvatar}
                            onDelete={() => onDelete(item)}
                            onDownload={() => onDownload(item)}
                            onToggleLike={() => onToggleLike(item.id)}
                            isDragEnabled={isDragEnabled && !isUploading}
                        />
                    ))}
                </div>
            </SortableContext>
        </div>
    );
};
