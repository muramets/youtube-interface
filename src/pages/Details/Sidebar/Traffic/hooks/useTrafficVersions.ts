import { useMemo, useCallback } from 'react';
import type { TrafficSnapshot } from '../../../../../core/types/traffic';
import type { PackagingVersion as PackagingVersionType } from '../../../../../core/types/versioning';
import { TrafficSnapshotService } from '../../../../../core/services/traffic/TrafficSnapshotService';

interface UseTrafficVersionsProps {
    versions: PackagingVersionType[];
    snapshots: TrafficSnapshot[];
    activeVersion: number | 'draft';
    publishDate?: number;
}

export interface VersionGroup {
    versionNumber: number;
    key: string;
    snapshots: TrafficSnapshot[];
    isActive: boolean;
    isDeleted: boolean;
}

export const useTrafficVersions = ({
    versions,
    snapshots,
    activeVersion,
    publishDate
}: UseTrafficVersionsProps) => {

    // Helper: Format a single timestamp for display
    const formatTimestamp = useCallback((timestamp: number) => {
        const date = new Date(timestamp);
        const display = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        const full = date.toLocaleString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
            hour12: true
        });
        return { display, full };
    }, []);

    // Helper: Format a date range (e.g. "Jan 5 – 12" or "Jan 5 – Feb 3")
    const formatDateRange = useCallback((start: number, end: number) => {
        const startDate = new Date(start);
        const endDate = new Date(end);
        const sameMonth = startDate.getMonth() === endDate.getMonth() && startDate.getFullYear() === endDate.getFullYear();

        if (sameMonth) {
            const month = startDate.toLocaleDateString('en-US', { month: 'short' });
            return `${month} ${startDate.getDate()} – ${endDate.getDate()}`;
        }
        const startStr = startDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        const endStr = endDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        return `${startStr} – ${endStr}`;
    }, []);

    // Format snapshot date with priority: label > activeDate range > timestamp
    const formatSnapshotDate = useCallback((timestamp: number, snapshot?: TrafficSnapshot) => {
        const uploaded = formatTimestamp(timestamp);

        // Priority 1: Custom label
        if (snapshot?.label) {
            const tooltipParts = [snapshot.label];
            if (snapshot.activeDate) {
                tooltipParts.push(formatDateRange(snapshot.activeDate.start, snapshot.activeDate.end));
            }
            tooltipParts.push(`Uploaded: ${uploaded.full}`);
            return {
                display: snapshot.label,
                tooltip: tooltipParts.join(' • ')
            };
        }

        // Priority 2: Active date range
        if (snapshot?.activeDate) {
            const rangeStr = formatDateRange(snapshot.activeDate.start, snapshot.activeDate.end);
            return {
                display: rangeStr,
                tooltip: `Active: ${rangeStr} • Uploaded: ${uploaded.full}`
            };
        }

        // Priority 3: Fallback to upload timestamp
        return { display: uploaded.display, tooltip: uploaded.full };
    }, [formatTimestamp, formatDateRange]);

    // Backfill activeDate for legacy snapshots that don't have it yet
    const enrichedSnapshots = useMemo(() => {
        return TrafficSnapshotService.backfillActiveDates(snapshots, publishDate);
    }, [snapshots, publishDate]);

    // Simple groupBy version + sort
    const sortedVersions = useMemo((): VersionGroup[] => {
        const versionSet = new Set(versions.map(v => v.versionNumber));

        // Group snapshots by version number
        const groups = new Map<number, TrafficSnapshot[]>();
        for (const snap of enrichedSnapshots) {
            const list = groups.get(snap.version) || [];
            list.push(snap);
            groups.set(snap.version, list);
        }

        // Build version groups: packaging versions + orphan snapshot versions
        const allVersionNumbers = new Set([...versionSet, ...groups.keys()]);
        const result: VersionGroup[] = [];

        for (const vNum of allVersionNumbers) {
            const versionSnapshots = groups.get(vNum) || [];
            const isActive = vNum === activeVersion;
            const isDeleted = !versionSet.has(vNum);

            // Hide versions with no snapshots (unless active)
            if (versionSnapshots.length === 0 && !isActive) continue;

            result.push({
                versionNumber: vNum,
                key: `${vNum}`,
                snapshots: versionSnapshots.sort((a, b) => b.timestamp - a.timestamp), // Latest first
                isActive,
                isDeleted,
            });
        }

        // Sort: active version first, then by version number descending
        result.sort((a, b) => {
            if (a.isActive && !b.isActive) return -1;
            if (!a.isActive && b.isActive) return 1;
            return b.versionNumber - a.versionNumber;
        });

        return result;
    }, [versions, enrichedSnapshots, activeVersion]);

    return {
        sortedVersions,
        formatSnapshotDate
    };
};
