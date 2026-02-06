import type { VideoDetails } from '../../../core/utils/youtubeApi';
import { formatDuration } from '../../../core/utils/formatUtils';

/**
 * Playlist Video CSV Export Utility
 * 
 * Generates a comprehensive CSV export of all videos in a playlist,
 * optimized for LLM analysis and data portability.
 */

// ============================================================================
// Types
// ============================================================================

export interface ExportPlaylistOptions {
    /** List of videos to export */
    videos: VideoDetails[];
    /** Name of the playlist for metadata */
    playlistName: string;
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Escape a value for CSV (RFC 4180 compliant)
 * Handles commas, quotes, and newlines by wrapping in quotes and escaping inner quotes.
 */
const escapeCSV = (value: string | number | undefined | null): string => {
    if (value === undefined || value === null) return '';
    const str = String(value);

    // Check if the string contains characters that require escaping
    if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
        // Double up any existing double quotes
        return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
};

/**
 * Format date to human-readable DD/MM/YYYY
 */
const formatDate = (isoDate: string | undefined): string => {
    if (!isoDate) return '';
    try {
        const date = new Date(isoDate);
        return date.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
    } catch {
        return '';
    }
};

/**
 * Get the best available thumbnail URL
 */
const getThumbnailUrl = (video: VideoDetails): string => {
    // Prefer maxres/highres if available in standard location, otherwise standard thumbnail
    // Note: VideoDetails.thumbnail is usually already the best available from the API
    return video.customImage || video.thumbnail || `https://i.ytimg.com/vi/${video.id}/hqdefault.jpg`;
};

// ============================================================================
// Main Export Function
// ============================================================================

export const exportPlaylistCsv = (options: ExportPlaylistOptions): string => {
    const { videos, playlistName } = options;
    const lines: string[] = [];

    // ========================================================================
    // 1. Metadata Header
    // ========================================================================
    const now = new Date();
    const dateStr = now.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const timeStr = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

    lines.push(`# Playlist Export: ${playlistName}`);
    lines.push(`# Export Date: ${dateStr} ${timeStr}`);
    lines.push(`# Total Videos: ${videos.length}`);
    lines.push(`#`);

    lines.push(`#`);

    // ========================================================================
    // 2. CSV Headers
    // ========================================================================
    const headers = [
        'video_id',
        'title',
        'channel_id',
        'channel_title',
        'view_count',
        'published_at',
        'duration',
        'description',
        'tags',
        'thumbnail_url'
    ];
    lines.push(headers.join(','));

    // ========================================================================
    // 3. Data Rows
    // ========================================================================
    for (const video of videos) {
        const row = [
            escapeCSV(video.id),
            escapeCSV(video.title),
            escapeCSV(video.channelId),
            escapeCSV(video.channelTitle),
            escapeCSV(video.viewCount),
            escapeCSV(formatDate(video.publishedAt)),
            escapeCSV(formatDuration(video.duration)),
            escapeCSV(video.description),
            escapeCSV(video.tags?.join(', ')),
            escapeCSV(getThumbnailUrl(video))
        ];

        lines.push(row.join(','));
    }

    // Add BOM for Excel compatibility
    return '\uFEFF' + lines.join('\n');
};

// ============================================================================
// Download Helpers
// ============================================================================

export const downloadCsv = (content: string, filename: string): void => {
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
};

export const generatePlaylistExportFilename = (playlistName: string): string => {
    const date = new Date().toISOString().split('T')[0];
    // Replace only illegal filesystem characters and spaces
    const sanitizedName = playlistName
        .replace(/[\\/:*?"<>|]/g, '')
        .replace(/\s+/g, '_')
        .substring(0, 50);

    const finalName = sanitizedName || 'unnamed';
    return `playlist_${finalName}_${date}.csv`;
};
