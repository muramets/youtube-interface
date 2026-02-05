/**
 * Gallery Types
 * 
 * Types for Visual Gallery feature - a file storage for cover images
 * associated with each reference video.
 */

// ============================================================================
// GALLERY SOURCES
// ============================================================================

/**
 * Type of inspiration source for visuals.
 */
export type GallerySourceType = 'original' | 'pinterest' | 'custom';

/**
 * A source of inspiration for gallery visuals.
 * Each video can have multiple sources (e.g., Original Video, Pinterest refs).
 */
export interface GallerySource {
    /** Unique ID (uuid) */
    id: string;

    /** Type of source */
    type: GallerySourceType;

    /** Display label (e.g., "Original Video", "Sunset Vibes") */
    label: string;

    /** Reference URL (e.g., Pinterest link) */
    url?: string;

    /** Creation timestamp */
    createdAt: number;
}

/**
 * Default source ID constant for "Original Video".
 */
export const DEFAULT_SOURCE_ID = 'original';

// ============================================================================
// GALLERY ITEMS
// ============================================================================

/**
 * Individual gallery item (uploaded image).
 */
export interface GalleryItem {
    /** Unique ID (uuid) */
    id: string;

    /** Original filename (displayed as title) */
    filename: string;

    /** Firebase Storage URL for original file (for download) */
    originalUrl: string;

    /** Firebase Storage URL for thumbnail (for grid display) */
    thumbnailUrl: string;

    /** Full path in Storage (for deletion) */
    storagePath: string;

    /** Upload timestamp */
    uploadedAt: number;

    /** Order index for custom sorting */
    order: number;

    /** Liked status */
    isLiked?: boolean;

    /** Original file size in bytes */
    fileSize?: number;

    /** Source ID this item belongs to */
    sourceId?: string;
}

/**
 * Constants for displaying gallery items as VideoCard.
 */
export const GALLERY_CARD_DEFAULTS = {
    /** Fixed view count displayed for all gallery items */
    viewCount: '1M',
} as const;

/**
 * Sort modes for gallery grid.
 */
export type GallerySortMode = 'custom' | 'newest' | 'oldest';

/**
 * Upload progress state.
 */
export interface GalleryUploadProgress {
    filename: string;
    progress: number; // 0-100
    status: 'uploading' | 'processing' | 'done' | 'error';
    error?: string;
}

