/**
 * GalleryGrid
 * 
 * Grid container for gallery items with drag-and-drop support
 * for custom ordering. Also acts as a drop zone for file uploads.
 */

import React, { useState, useCallback } from 'react';
import {
    DndContext,
    closestCenter,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
    type DragEndEvent
} from '@dnd-kit/core';
import {
    arrayMove,
    SortableContext,
    sortableKeyboardCoordinates,
    rectSortingStrategy
} from '@dnd-kit/sortable';
import { Loader2 } from 'lucide-react';
import type { GalleryItem, GallerySortMode } from '../../../../core/types/gallery';
import { GalleryCard } from './GalleryCard';

interface GalleryGridProps {
    items: GalleryItem[];
    channelTitle: string;
    channelAvatar: string;
    zoomLevel: number;
    sortMode: GallerySortMode;
    onDelete: (item: GalleryItem) => Promise<void>;
    onDownload: (item: GalleryItem) => Promise<void>;
    onToggleLike: (itemId: string) => Promise<void>;
    onReorder: (reorderedItems: GalleryItem[]) => Promise<void>;
    // File upload props
    onUpload: (file: File) => Promise<void>;
    isUploading: boolean;
    uploadingFilename: string | null;
}

// Map zoom level to grid columns
const ZOOM_TO_COLUMNS: Record<number, string> = {
    1: 'grid-cols-2',
    2: 'grid-cols-3',
    3: 'grid-cols-4',
    4: 'grid-cols-5',
    5: 'grid-cols-6',
};

export const GalleryGrid: React.FC<GalleryGridProps> = ({
    items,
    channelTitle,
    channelAvatar,
    zoomLevel,
    sortMode,
    onDelete,
    onDownload,
    onToggleLike,
    onReorder,
    onUpload,
    isUploading,
    uploadingFilename
}) => {
    // Always enable drag
    const isDragEnabled = true;
    const [isDragOver, setIsDragOver] = useState(false);

    const sensors = useSensors(
        useSensor(PointerSensor, {
            activationConstraint: {
                distance: 8, // Require 8px movement before drag starts
            },
        }),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        })
    );

    const handleDragEnd = async (event: DragEndEvent) => {
        const { active, over } = event;

        if (over && active.id !== over.id) {
            const oldIndex = items.findIndex(item => item.id === active.id);
            const newIndex = items.findIndex(item => item.id === over.id);

            const reorderedItems = arrayMove(items, oldIndex, newIndex);
            await onReorder(reorderedItems);
        }
    };

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

        // Upload first valid image (can be extended for multiple)
        if (imageFiles.length > 0 && !isUploading) {
            await onUpload(imageFiles[0]);
        }
    }, [onUpload, isUploading]);

    // Track item count before upload starts
    const uploadStartCountRef = React.useRef(items.length);
    if (!isUploading) {
        uploadStartCountRef.current = items.length;
    }

    return (
        <div
            className={`relative flex-1 min-h-[400px] rounded-xl transition-all duration-200 ${isDragOver ? 'bg-white/5 ring-2 ring-white/20 ring-dashed' : ''}`}
            onDragOver={handleFileDragOver}
            onDragLeave={handleFileDragLeave}
            onDrop={handleFileDrop}
        >
            <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
            >
                <SortableContext
                    items={items.map(item => item.id)}
                    strategy={rectSortingStrategy}
                >
                    <div className={`grid ${ZOOM_TO_COLUMNS[zoomLevel] || 'grid-cols-4'} gap-4 content-start`}>
                        {/* Upload Placeholder Card - shown first during upload */}
                        {isUploading && (
                            <div className="group relative flex flex-col gap-2 p-[6px] rounded-xl isolate">
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
                                            {uploadingFilename || 'Uploading...'}
                                        </div>
                                        <div className="text-xs text-text-secondary mt-0.5">
                                            {channelTitle}
                                        </div>
                                        <div className="text-xs text-text-secondary">
                                            1M views • Uploading...
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {items.map((item, index) => {
                            // Check if new item has arrived (length increased)
                            const hasNewItemArrived = items.length > uploadStartCountRef.current;

                            // Hide the first item (duplicate) ONLY if new item has arrived
                            // and we are in 'newest' sort mode (where new item appears first)
                            const isHidden = isUploading &&
                                hasNewItemArrived &&
                                sortMode === 'newest' &&
                                index === 0;

                            if (isHidden) return null;

                            return (
                                <GalleryCard
                                    key={item.id}
                                    item={item}
                                    channelTitle={channelTitle}
                                    channelAvatar={channelAvatar}
                                    onDelete={() => onDelete(item)}
                                    onDownload={() => onDownload(item)}
                                    onToggleLike={() => onToggleLike(item.id)}
                                    isDragEnabled={isDragEnabled}
                                />
                            );
                        })}
                    </div>
                </SortableContext>
            </DndContext>
        </div>
    );
};
