import type { TrafficSource, EnrichedTrafficSource, TrafficFilter } from '../../../../../core/types/traffic';
import type { TrafficType } from '../../../../../core/types/videoTrafficType';
import type { ViewerType } from '../../../../../core/types/viewerType';
import type { VideoReaction } from '../../../../../core/types/videoReaction';
import type { TrafficNicheProperty } from '../../../../../core/types/suggestedTrafficNiches';
import type { MetricDelta } from '../hooks/useTrafficDataLoader';
import { csvLogger } from '../../../../../core/utils/logger';

/**
 * Minimal niche info needed for export
 */
interface NicheInfo {
    id: string;
    name: string;
    property?: TrafficNicheProperty;
}

/**
 * Export configuration for rich CSV generation
 */
export interface ExportTrafficCsvOptions {
    /** Filtered and enriched traffic sources to export */
    sources: EnrichedTrafficSource[];
    /** Optional total row with aggregated metrics */
    totalRow?: TrafficSource;
    /** Available niches for name lookup */
    niches: NicheInfo[];
    /** Video ID -> Niche ID assignments */
    assignments: Record<string, string>;
    /** Traffic type edges */
    trafficEdges: Record<string, { type: TrafficType; source?: 'manual' | 'smart_assistant' }>;
    /** Viewer type edges */
    viewerEdges: Record<string, { type: ViewerType; source?: 'manual' | 'smart_assistant' }>;
    /** Analyst notes (videoId -> text) — subjective comments */
    noteMap?: Record<string, string>;
    /** Analyst reactions (videoId -> reaction) — subjective video type */
    reactionMap?: Record<string, VideoReaction>;
    /** Discrepancy report text if available */
    discrepancyReport?: string;
    /** Warnings from total row analysis */
    warnings?: string[];
    /** Export metadata */
    metadata: {
        viewMode: 'cumulative' | 'delta';
        snapshotId?: string | null;
        filters: TrafficFilter[];
        videoTitle?: string;
    };
}

/**
 * Generate specific discrepancy report text mirroring SmartTrafficTooltip logic
 */
export const generateDiscrepancyReport = (
    actualTotal: number,
    tableSum: number, // Visible sum (filtered)
    trashValue: number = 0,
    deltaContext?: MetricDelta,
    isIncomplete?: boolean
): string | undefined => {
    if (isIncomplete) {
        return `Comparison Unavailable: The "Total" column was not found in the uploaded CSV for the previous snapshot. Without an explicit total row, the application cannot calculate the true traffic growth vs. new table entries.`;
    }

    // 1. Delta Growth Analysis
    if (deltaContext) {
        const { previous = 0, current = 0, delta = 0 } = deltaContext;
        const trashChange = trashValue;
        const nonTrashTableGrowth = tableSum;
        const unaccountedGrowth = Math.max(0, delta - (nonTrashTableGrowth + trashChange));

        // Only report if there IS delta
        if (delta === 0) return undefined;

        const lines = [
            `Traffic Growth Analysis:`,
            `Total Change (Report): ${previous} -> ${current} (+${delta})`,
            `Breakdown:`,
            `- Top Videos Growth: +${nonTrashTableGrowth}`
        ];

        if (trashChange > 0) {
            lines.push(`- Trash Traffic Variation: +${trashChange}`);
        }

        lines.push(`- Unaccounted Growth: +${unaccountedGrowth}`);
        lines.push(`Explanation: This breakdown shows actual growth between reports compared to the new videos appearing in your table.`);

        return lines.join('\n# ');
    }

    // 2. Cumulative Discrepancy (All Time)
    const nonTrashTable = tableSum;
    const longTail = Math.max(0, actualTotal - (nonTrashTable + trashValue));

    // Only report if valid total
    if (actualTotal <= 0) return undefined;

    const lines = [
        `Traffic Discrepancy Explained:`,
        `Actual Total (from report): ${actualTotal}`,
        `Breakdown:`,
        `- Top Videos Sum: ${nonTrashTable}`
    ];

    if (trashValue > 0) {
        lines.push(`- Trash Content: ${trashValue}`);
    }

    lines.push(`- Long Tail Difference: +${longTail}`);
    lines.push(`Explanation: The list below displays your top performing sources. The difference in numbers represents the 'Long Tail' — aggregated data from minor sources and privacy-protected views that are hidden to keep your report clean.`);
    lines.push(`Note: A large discrepancy often signals that the algorithm is still in the exploration phase — testing your content across random topics because it hasn't locked onto a specific target audience yet.`);

    return lines.join('\n# ');
};

/**
 * Escape a value for CSV (RFC 4180 compliant)
 */
const escapeCSV = (value: string | number | undefined | null): string => {
    if (value === undefined || value === null) return '';
    const str = String(value);
    // If contains comma, quote, or newline, wrap in quotes and escape internal quotes
    if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
        return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
};

/**
 * Format filter description for metadata
 */
const formatFilters = (filters: TrafficFilter[]): string => {
    if (filters.length === 0) return 'None';
    return filters.map(f => f.label).join(', ');
};

/**
 * Generate comprehensive CSV export for Traffic table
 * Includes all enriched data for LLM analysis
 */
export const exportTrafficCsv = (options: ExportTrafficCsvOptions): string => {
    const {
        sources,
        totalRow,
        niches,
        assignments,
        trafficEdges,
        viewerEdges,
        noteMap = {},
        reactionMap = {},
        warnings = [],
        metadata
    } = options;

    csvLogger.debug('Starting rich export', { sourcesCount: sources.length });

    const lines: string[] = [];

    // 1. Metadata header (commented lines)
    lines.push(`# Traffic Export - ${metadata.videoTitle || 'Unknown Video'}`);
    lines.push(`# Export Date: ${new Date().toISOString()}`);
    lines.push(`# View Mode: ${metadata.viewMode}`);
    lines.push(`# Snapshot: ${metadata.snapshotId || 'Latest'}`);
    lines.push(`# Filters: ${formatFilters(metadata.filters)}`);

    lines.push(`#`);
    lines.push(`# Note on Niche: This column reflects subjective user-defined classification or suggestions.`);

    // Add Classification Criteria
    lines.push(`#`);
    lines.push(`# Classification Criteria (Smart Assistant):`);
    lines.push(`# 1. Traffic Type:`);
    lines.push(`#    - Autoplay: Assigned when a source has 0 Impressions but >0 Views (indicating playback without thumbnail impression).`);
    lines.push(`# 2. Viewer Type:`);
    lines.push(`#    - Based on Average View Duration (AVD) relative to Total Video Duration:`);
    lines.push(`#      * Bouncer:    < 1%`);
    lines.push(`#      * Trialist:   1% - 10%`);
    lines.push(`#      * Explorer:   10% - 30%`);
    lines.push(`#      * Interested: 30% - 60%`);
    lines.push(`#      * Core:       60% - 95%`);
    lines.push(`#      * Passive:    > 95%`);
    lines.push(`#`);
    lines.push(`# Analyst Columns (Subjective):`);
    lines.push(`# - analyst_comment: Free-text note added by the analyst for a given video.`);
    lines.push(`# - analyst_video_type: Subjective categorization — star (remarkable content), like (positive signal), dislike (negative signal).`);
    lines.push(`# These columns reflect the analyst's personal opinion and are NOT auto-generated.`);
    lines.push(`#`);

    lines.push(`# Total Sources: ${sources.length}`);

    if (warnings.length > 0) {
        lines.push(`# Warnings: ${warnings.join('; ')}`);
    }

    if (options.discrepancyReport) {
        lines.push(`#`);
        // Report already contains newlines and # prefix from helper, but ensure safety
        lines.push(`# ${options.discrepancyReport.replace(/\n/g, '\n# ')}`);
    }

    // Total metrics if available
    if (totalRow) {
        lines.push(`# Total Impressions: ${totalRow.impressions}`);
        lines.push(`# Total Views: ${totalRow.views}`);
        lines.push(`# Total CTR: ${totalRow.ctr}%`);
    }

    lines.push('#'); // Empty comment line separator

    // 2. CSV Headers
    const headers = [
        'video_id',
        'source_title',
        'channel_title',
        'channel_id',
        'description',
        'tags',
        'niche',
        'traffic_type',
        'traffic_type_source',
        'viewer_type',
        'viewer_type_source',
        'impressions',
        'ctr_percent',
        'views',
        'avg_view_duration',
        'watch_time_hours',
        'published_at',
        'thumbnail_url',
        'analyst_comment',
        'analyst_video_type'
    ];
    lines.push(headers.join(','));

    // 3. Data rows
    sources.forEach(source => {
        const videoId = source.videoId || '';
        const nicheId = videoId ? assignments[videoId] : undefined;
        const niche = nicheId ? niches.find(n => n.id === nicheId) : undefined;
        const trafficEdge = videoId ? trafficEdges[videoId] : undefined;
        const viewerEdge = videoId ? viewerEdges[videoId] : undefined;

        const row = [
            escapeCSV(videoId),
            escapeCSV(source.sourceTitle),
            escapeCSV(source.channelTitle),
            escapeCSV(source.channelId),
            escapeCSV(source.description),
            escapeCSV(source.tags?.join(', ')),
            escapeCSV(niche?.name),
            escapeCSV(trafficEdge?.type),
            escapeCSV(trafficEdge?.source),
            escapeCSV(viewerEdge?.type),
            escapeCSV(viewerEdge?.source),
            escapeCSV(source.impressions),
            escapeCSV(source.ctr),
            escapeCSV(source.views),
            escapeCSV(source.avgViewDuration),
            escapeCSV(source.watchTimeHours),
            escapeCSV(source.publishedAt ? new Date(source.publishedAt).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }) : ''),
            escapeCSV(videoId ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` : ''),
            escapeCSV(videoId ? noteMap[videoId] : ''),
            escapeCSV(videoId ? reactionMap[videoId] : '')
        ];

        lines.push(row.join(','));
    });

    csvLogger.debug('Export complete', { linesCount: lines.length });

    // 4. Add BOM for Excel compatibility
    return '\uFEFF' + lines.join('\n');
};

/**
 * Trigger file download in browser
 */
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

/**
 * Generate filename for export
 */
export const generateExportFilename = (
    videoTitle: string,
    viewMode: 'cumulative' | 'delta'
): string => {
    const sanitized = videoTitle
        .replace(/[^a-zA-Z0-9\s-]/g, '')
        .replace(/\s+/g, '_')
        .substring(0, 50);
    const date = new Date().toISOString().split('T')[0];
    return `traffic_${sanitized}_${viewMode}_${date}.csv`;
};
