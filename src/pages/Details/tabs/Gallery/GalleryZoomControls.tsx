/**
 * GalleryZoomControls
 * 
 * Floating zoom controls for Visual Gallery grid.
 * Uses local state (localStorage) separate from Home/Playlist zoom settings.
 */

import React from 'react';
import { Plus, Minus } from 'lucide-react';
import {
    GALLERY_ZOOM_STORAGE_KEY,
    MIN_GALLERY_ZOOM,
    MAX_GALLERY_ZOOM
} from './galleryZoomUtils';

interface GalleryZoomControlsProps {
    value: number;
    onChange: (level: number) => void;
}

export const GalleryZoomControls: React.FC<GalleryZoomControlsProps> = ({
    value,
    onChange
}) => {
    const handleZoomOut = () => {
        if (value < MAX_GALLERY_ZOOM) {
            const newValue = value + 1;
            onChange(newValue);
            localStorage.setItem(GALLERY_ZOOM_STORAGE_KEY, newValue.toString());
        }
    };

    const handleZoomIn = () => {
        if (value > MIN_GALLERY_ZOOM) {
            const newValue = value - 1;
            onChange(newValue);
            localStorage.setItem(GALLERY_ZOOM_STORAGE_KEY, newValue.toString());
        }
    };

    return (
        <div className="absolute bottom-8 right-8 flex flex-row gap-2 z-50">
            <button
                className="w-12 h-12 rounded-full bg-bg-secondary hover:bg-hover-bg text-text-primary shadow-lg flex items-center justify-center transition-all hover:scale-110 active:scale-95 border border-border cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                onClick={handleZoomOut}
                disabled={value >= MAX_GALLERY_ZOOM}
                title="Zoom Out (More Columns)"
            >
                <Minus size={24} />
            </button>
            <button
                className="w-12 h-12 rounded-full bg-bg-secondary hover:bg-hover-bg text-text-primary shadow-lg flex items-center justify-center transition-all hover:scale-110 active:scale-95 border border-border cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                onClick={handleZoomIn}
                disabled={value <= MIN_GALLERY_ZOOM}
                title="Zoom In (Fewer Columns)"
            >
                <Plus size={24} />
            </button>
        </div>
    );
};
