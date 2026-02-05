/**
 * GalleryHeader
 * 
 * Sticky header for Visual Gallery tab with title, sort controls,
 * and upload button. Zoom controls are floating (in GalleryTab).
 */

import React from 'react';
import { Upload } from 'lucide-react';
import { Button } from '../../../../components/ui/atoms/Button';
import { SortButton, type SortOption } from '../../../../features/Filter/SortButton';
import type { GallerySortMode } from '../../../../core/types/gallery';

interface GalleryHeaderProps {
    itemCount: number;
    sortMode: GallerySortMode;
    onSortChange: (mode: GallerySortMode) => void;
    onUploadClick: () => void;
    isScrolled: boolean;
    subtitle?: string;
}

const SORT_OPTIONS: SortOption[] = [
    { value: 'newest', label: 'Newest First' },
    { value: 'oldest', label: 'Oldest First' },
    { value: 'custom', label: 'Manual Order' },
];

export const GalleryHeader: React.FC<GalleryHeaderProps> = ({
    itemCount,
    subtitle,
    sortMode,
    onSortChange,
    onUploadClick,
    isScrolled
}) => {
    return (
        <div className={`sticky top-0 z-10 px-6 py-4 transition-shadow duration-200 bg-video-edit-bg ${isScrolled ? 'shadow-[0_2px_8px_rgba(0,0,0,0.3)]' : ''}`}>
            <div className="flex items-center gap-4 max-w-[1200px]">
                {/* Title with count */}
                <div>
                    <h1 className="text-2xl font-medium text-text-primary">
                        Visual Gallery
                        {itemCount > 0 && (
                            <span className="ml-2 text-base font-normal text-text-secondary">
                                ({itemCount} {itemCount === 1 ? 'image' : 'images'})
                            </span>
                        )}
                    </h1>
                    {subtitle && (
                        <p className="text-sm text-text-secondary mt-1">
                            {subtitle}
                        </p>
                    )}
                </div>

                <div className="flex-1" />

                {/* Sort Button (reused from Filter) */}
                <SortButton
                    sortOptions={SORT_OPTIONS}
                    activeSort={sortMode}
                    onSortChange={(value) => onSortChange(value as GallerySortMode)}
                />

                {/* Upload Button */}
                <Button
                    variant="primary"
                    size="sm"
                    onClick={onUploadClick}
                    leftIcon={<Upload size={16} />}
                >
                    Upload
                </Button>
            </div>
        </div>
    );
};
