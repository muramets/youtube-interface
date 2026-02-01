import type { TrendVideo, TrendNiche } from '../../../core/types/trends';

/**
 * Trends Video CSV Export Utility
 * 
 * Premium export for LLM analysis of video hits and trends.
 */

// ============================================================================
// Types
// ============================================================================

export interface ExportTrendsVideoOptions {
    /** Selected videos to export */
    videos: TrendVideo[];
    /** Niche lookup map (id -> niche) */
    niches: TrendNiche[];
    /** Video to niche assignments map */
    videoNicheAssignments: Record<string, { nicheId: string; addedAt: number }[]>;
    /** Channel name for metadata */
    channelName?: string;
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Escape a value for CSV (handles commas, quotes, newlines)
 */
const escapeCSV = (value: string | number | undefined | null): string => {
    if (value === undefined || value === null) return '';
    const str = String(value);
    // If contains comma, quote, or newline, wrap in quotes and escape inner quotes
    if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
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
 * Generate thumbnail URL from video ID
 */
const getThumbnailUrl = (videoId: string): string => {
    return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
};

// ============================================================================
// Main Export Function
// ============================================================================

export const exportTrendsVideoCsv = (options: ExportTrendsVideoOptions): string => {
    const { videos, niches, videoNicheAssignments, channelName } = options;
    const lines: string[] = [];

    // ========================================================================
    // 1. Metadata Header
    // ========================================================================
    lines.push(`# Trends Video Export`);
    lines.push(`# Export Date: ${new Date().toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })} ${new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`);
    lines.push(`# Videos: ${videos.length}`);
    if (channelName) {
        lines.push(`# Source: ${channelName}`);
    }
    lines.push(`#`);
    lines.push(`# Note: This export is optimized for LLM analysis.`);
    lines.push(`# Niche assignments are subjective user-defined classifications.`);
    lines.push(`#`);

    // ========================================================================
    // 2. CSV Headers
    // ========================================================================
    const headers = [
        'video_id',
        'title',
        'channel_id',
        'channel_title',
        'niche',
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
        // Lookup niches from assignments map
        const assignments = videoNicheAssignments[video.id] || [];
        const nicheNames = assignments
            .map(a => niches.find(n => n.id === a.nicheId)?.name)
            .filter((n): n is string => !!n);
        const nicheStr = nicheNames.join('; ');

        const row = [
            escapeCSV(video.id),
            escapeCSV(video.title),
            escapeCSV(video.channelId),
            escapeCSV(video.channelTitle),
            escapeCSV(nicheStr),
            escapeCSV(video.viewCount),
            escapeCSV(formatDate(video.publishedAt)),
            escapeCSV(video.duration),
            escapeCSV(video.description),
            escapeCSV(video.tags?.join(', ')),
            escapeCSV(getThumbnailUrl(video.id))
        ];

        lines.push(row.join(','));
    }

    return lines.join('\n');
};

// ============================================================================
// Download Helper
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

// ============================================================================
// Filename Generator
// ============================================================================

export const generateTrendsExportFilename = (videoCount: number, channelName?: string): string => {
    const date = new Date().toISOString().split('T')[0];
    const sanitizedChannel = channelName
        ? channelName.toLowerCase().replace(/[^a-z0-9]+/g, '_').substring(0, 30)
        : 'trends';
    return `${sanitizedChannel}_videos_${videoCount}_${date}.csv`;
};
