import type { VideoLocalization } from '../utils/youtubeApi';

/**
 * Active Period для версий.
 * Представляет период времени, когда версия была активной.
 */
export interface ActivePeriod {
    startDate: number;
    endDate: number | null;
    closingSnapshotId: string | null;
}

export interface CTRRule {
    id: string;
    operator: '<' | '>' | '<=' | '>=' | 'between';
    value: number;
    maxValue?: number; // For 'between' operator
    color: string;
}

export interface PackagingMetrics {
    impressions: number | null;
    ctr: number | null; // Percentage
    views: number | null;
    avdSeconds: number | null; // Average View Duration in seconds
}

export interface ABVariantMetrics {
    variantId: string; // URL or ID of the variant
    watchTimePercentage: number;
}

export interface PackagingCheckin {
    id: string;
    date: number; // Timestamp
    metrics: PackagingMetrics;
    abMetrics?: ABVariantMetrics[];
    diffs?: Partial<PackagingMetrics>; // Difference from previous check-in
    ruleId?: string;
    isFinal?: boolean; // User manually marked as last for version
}

/**
 * Packaging Snapshot.
 * Снимок конфигурации упаковки на момент создания версии.
 */
export interface PackagingSnapshot {
    title: string;
    description: string;
    tags: string[];
    coverImage: string | null;
    abTestTitles?: string[];
    abTestThumbnails?: string[];
    abTestResults?: {
        titles: number[];
        thumbnails: number[];
    };
    abTestVariants?: string[];
    localizations?: Record<string, VideoLocalization>;
    originalName?: string;
}

/**
 * Packaging Version.
 * Представляет версию упаковки видео с историей активности.
 */
export interface PackagingVersion {
    versionNumber: number;
    startDate: number;
    endDate: number | null;
    configurationSnapshot: PackagingSnapshot | null;
    activePeriods?: ActivePeriod[];
    revision: number; // NEW: для tracking stale state и race conditions
    cloneOf?: number; // Alias support
    checkins?: PackagingCheckin[];
    restoredAt?: number;
}

/**
 * Traffic Snapshot (Base).
 * Core fields for traffic snapshot identification and storage.
 * Extended in traffic.ts with additional metadata fields.
 */
export interface TrafficSnapshotBase {
    id: string;
    version: number;
    timestamp: number;
    createdAt: string;
    storagePath: string; // REQUIRED: путь к CSV в Cloud Storage (no legacy support)
    /** Custom user-defined name for the snapshot (e.g. "Before title change") */
    label?: string;
    /** Period when this data was active in YT Studio (date range) */
    activeDate?: { start: number; end: number };
    summary: {
        totalViews: number;
        totalWatchTime: number;
        sourcesCount: number;
        topSource?: string;
        // Cached totalRow metrics for delta calculations without CSV download
        totalImpressions?: number;
        totalCtr?: number;
    };
}
