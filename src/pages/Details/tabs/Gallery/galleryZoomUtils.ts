/**
 * Gallery Zoom Utilities
 * 
 * Shared constants and utility functions for gallery zoom controls.
 * Separated from component for Fast Refresh compatibility.
 */

export const GALLERY_ZOOM_STORAGE_KEY = 'gallery-zoom-level';
export const MIN_GALLERY_ZOOM = 2;
export const MAX_GALLERY_ZOOM = 9;
export const DEFAULT_GALLERY_ZOOM = 4;

/**
 * Get initial zoom level from localStorage
 */
export const getGalleryZoomLevel = (): number => {
    const saved = localStorage.getItem(GALLERY_ZOOM_STORAGE_KEY);
    return saved ? parseInt(saved, 10) : DEFAULT_GALLERY_ZOOM;
};
