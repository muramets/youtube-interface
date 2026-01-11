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
    summary: {
        totalViews: number;
        totalWatchTime: number;
        sourcesCount: number;
        topSource?: string;
    };
}
