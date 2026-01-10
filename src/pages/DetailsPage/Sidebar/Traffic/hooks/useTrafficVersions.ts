import { useMemo } from 'react';
import type { TrafficSnapshot } from '../../../../../core/types/traffic';
import type { PackagingVersion as PackagingVersionType } from '../../../../../core/utils/youtubeApi';

interface UseTrafficVersionsProps {
    versions: PackagingVersionType[];
    snapshots: TrafficSnapshot[];
    activeVersion: number | 'draft';
    isVideoPublished: boolean;
}

export const useTrafficVersions = ({
    versions,
    snapshots,
    activeVersion,
    isVideoPublished
}: UseTrafficVersionsProps) => {

    // Helper: Get snapshots for a specific virtual period
    const getVirtualVersionSnapshots = (version: number, start: number, end?: number | null): TrafficSnapshot[] => {
        return snapshots.filter(s => {
            if (s.version !== version) return false;
            // Strict timestamp check: must be >= start AND (if end exists) <= end
            // Adding small buffer (5000ms) to ensure boundary inclusions
            const matchesStart = s.timestamp >= (start - 5000);
            const matchesEnd = end ? s.timestamp <= (end + 5000) : true;
            return matchesStart && matchesEnd;
        }).sort((a, b) => b.timestamp - a.timestamp); // Latest first
    };

    // Helper: Format date for tooltips
    const formatSnapshotDate = (timestamp: number) => {
        const date = new Date(timestamp);
        const display = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        const tooltip = date.toLocaleString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
            hour12: true
        });
        return { display, tooltip };
    };

    const sortedVersions = useMemo(() => {
        const packagingVersionSet = new Set(versions.map(v => v.versionNumber));
        const snapshotVersionSet = new Set(snapshots.map(s => s.version));

        // Find versions that exist in snapshots but NOT in packaging history (deleted versions)
        const deletedVersionNumbers = [...snapshotVersionSet].filter(v => !packagingVersionSet.has(v));

        // Create placeholders for deleted versions
        const deletedVersions: PackagingVersionType[] = deletedVersionNumbers.map(vNum => ({
            versionNumber: vNum,
            startDate: 0,
            checkins: [],
            // Minimal mock of configurationSnapshot to satisfy type
            configurationSnapshot: {
                title: '',
                description: '',
                tags: [],
                coverImage: null
            } as any
        }));

        // Combine all raw versions
        let allVersions = [...versions, ...deletedVersions];

        // Virtual Expansion Helper
        const virtualList: Array<{
            original: PackagingVersionType;
            displayVersion: number;
            effectiveDate: number;
            periodStart: number;
            periodEnd?: number | null;
            isRestored: boolean;
            restorationIndex?: number;
            arrayIndex: number;
            key: string;
            tooltip: string;
        }> = [];

        allVersions.forEach(v => {
            if (!v.activePeriods || v.activePeriods.length <= 1) {
                // Single period (standard) or legacy version without activePeriods
                const snapshots = getVirtualVersionSnapshots(v.versionNumber, v.startDate || 0, v.endDate);
                const isActive = v.versionNumber === activeVersion;

                // GHOST FILTER: Hide if inactive AND has no data
                if (!isActive && snapshots.length === 0) return;

                // Generate Tooltip
                const startStr = formatSnapshotDate(v.activePeriods?.[0]?.startDate || v.startDate || 0).display;
                const endVal = v.activePeriods?.[0]?.endDate || v.endDate;
                const endStr = endVal ? formatSnapshotDate(endVal).display : null;
                const tooltip = endStr
                    ? `Active: ${startStr} – ${endStr}`
                    : `Active since ${startStr}`;

                virtualList.push({
                    original: v,
                    displayVersion: v.versionNumber,
                    effectiveDate: (v.activePeriods?.[0]?.startDate || v.startDate || 0) as number,
                    periodStart: (v.activePeriods?.[0]?.startDate || v.startDate || 0) as number,
                    periodEnd: v.activePeriods?.[0]?.endDate || v.endDate,
                    isRestored: false,
                    arrayIndex: 0,
                    key: `${v.versionNumber}-0`,
                    tooltip
                });
            } else {
                // Multiple periods (Restored)
                v.activePeriods.forEach((period: any, index: number) => {
                    const snapshots = getVirtualVersionSnapshots(v.versionNumber, period.startDate, period.endDate);
                    const isActive = !period.endDate;

                    // GHOST FILTER REFINED
                    if (!isActive && snapshots.length === 0) return;

                    // Restoration count: newest is at index 0
                    const rIndex = (v.activePeriods!.length - 1) - index;

                    const startStr = formatSnapshotDate(period.startDate).display;
                    const endStr = period.endDate ? formatSnapshotDate(period.endDate).display : null;
                    const tooltip = endStr
                        ? `Active: ${startStr} – ${endStr}`
                        : `Active since ${startStr}`;

                    virtualList.push({
                        original: v,
                        displayVersion: v.versionNumber,
                        effectiveDate: period.startDate as number,
                        periodStart: period.startDate as number,
                        periodEnd: period.endDate,
                        isRestored: rIndex > 0,
                        restorationIndex: rIndex > 0 ? rIndex : undefined,
                        arrayIndex: index,
                        key: `${v.versionNumber}-${index}`,
                        tooltip
                    });
                });
            }
        });

        // 2. Count frequencies for conditional badge display
        const versionCounts: Record<number, number> = {};
        virtualList.forEach(item => {
            versionCounts[item.displayVersion] = (versionCounts[item.displayVersion] || 0) + 1;
        });

        // 3. Final Sort & Decoration
        const sortedResults = [...virtualList].sort((a, b) => {
            // Priority 1: Check if this specific PERIOD is active
            const isActiveA = a.displayVersion === activeVersion && !a.periodEnd;
            const isActiveB = b.displayVersion === activeVersion && !b.periodEnd;

            if (isActiveA && !isActiveB) return -1;
            if (!isActiveA && isActiveB) return 1;

            return b.effectiveDate - a.effectiveDate;
        }).map(item => ({
            ...item,
            showRestored: versionCounts[item.displayVersion] > 1
        }));

        return sortedResults;
    }, [versions, snapshots, activeVersion, isVideoPublished]);

    return {
        sortedVersions,
        getVirtualVersionSnapshots,
        formatSnapshotDate
    };
};
