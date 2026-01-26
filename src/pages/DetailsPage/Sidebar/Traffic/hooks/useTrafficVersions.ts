import { useMemo } from 'react';
import type { TrafficSnapshot } from '../../../../../core/types/traffic';
import type { PackagingVersion as PackagingVersionType } from '../../../../../core/types/versioning';

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
            // EXCEPTION: If end is null/undefined, we accept all future snapshots (e.g. for active version)
            // BUT: For historical versions, we usually pass an 'end'.
            // To support "late-arriving" snapshots for the LATEST period of a historical version,
            // we should interpret the 'end' parameter carefully.
            // If the caller passes 'end', we respect it. 
            // The Logic fix needs to be passed in from the caller (the loop below).

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
            endDate: null,
            revision: 0,
            checkins: [],
            // Minimal mock of configurationSnapshot to satisfy type
            configurationSnapshot: {
                title: '',
                description: '',
                tags: [],
                coverImage: null
            } as any,
            // We'll rely on snapshots[].packagingSnapshot for deleted versions' metadata
            activePeriods: []
        }));

        // Combine all raw versions
        const allVersions = [...versions, ...deletedVersions];

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
            isDeleted?: boolean;
        }> = [];

        // 0. Pre-calculate GLOBAL ACTIVE TIMELINE
        // We need this to determine if a gap between two periods of Version X
        // was filled by Version Y (Intervention) or was just empty (Draft).
        const globalActivePeriods: Array<{
            version: number;
            start: number;
            end: number | null;
        }> = [];

        allVersions.forEach(v => {
            if (v.activePeriods && v.activePeriods.length > 0) {
                v.activePeriods.forEach(p => globalActivePeriods.push({
                    version: v.versionNumber,
                    start: p.startDate,
                    end: p.endDate
                }));
            } else if (v.startDate) {
                globalActivePeriods.push({
                    version: v.versionNumber,
                    start: v.startDate,
                    end: v.endDate || null
                });
            }
        });

        allVersions.forEach(v => {
            const snapshotsForVersion = snapshots.filter(s => s.version === v.versionNumber);

            if (v.activePeriods && v.activePeriods.length > 0) {
                // COALESCE CONTIGUOUS PERIODS
                // Logic: Gap between Period A (end T1) and Period B (start T2).
                // If ANY OTHER version was active in [T1, T2], then we SPLIT.
                // If NO other version was active (Draft mode), we MERGE.
                const sortedPeriods = [...v.activePeriods].sort((a, b) => a.startDate - b.startDate);
                const coalescedPeriods: { startDate: number; endDate: number | null }[] = [];

                if (sortedPeriods.length > 0) {
                    let current = { ...sortedPeriods[0] };

                    for (let i = 1; i < sortedPeriods.length; i++) {
                        const next = sortedPeriods[i];

                        // Check if we should merge
                        // Condition: current is closed (has endDate), and next follows it.
                        if (current.endDate !== null) {
                            const gapStart = current.endDate;
                            const gapEnd = next.startDate;

                            // Find INTERVENING version
                            // A version V' (V' != V) is intervening if it has a period that OVERLAPS the gap.
                            // Gap is [gapStart, gapEnd].
                            // Intersection: Max(StartA, StartB) < Min(EndA, EndB)
                            const isInterrupted = globalActivePeriods.some(other => {
                                if (other.version === v.versionNumber) return false;

                                const otherEnd = other.end || Date.now(); // Treat active as NOW
                                // Check overlap with gap [gapStart, gapEnd]
                                // Note: Gap might be 0 length or negative if data is weird, but usually positive.
                                const overlapStart = Math.max(gapStart, other.start);
                                const overlapEnd = Math.min(gapEnd, otherEnd);

                                // Significant overlap (> 1 min) to avoid noise? 
                                // Or strict overlap? Let's use strict > 1000ms to be safe.
                                return overlapEnd - overlapStart > 1000;
                            });

                            if (!isInterrupted) {
                                // MERGE: No other version interrupted, so it was just "Draft" state.
                                current.endDate = next.endDate;
                            } else {
                                // SPLIT: Another version was active in between.
                                coalescedPeriods.push(current);
                                current = { ...next };
                            }
                        } else {
                            // Current is open-ended (should be last, but if list is weird)
                            coalescedPeriods.push(current);
                            current = { ...next };
                        }
                    }
                    coalescedPeriods.push(current);
                }

                // Multiple periods (Restored or Coalesced)
                coalescedPeriods.forEach((period: any, index: number) => {
                    const versionSnapshots = getVirtualVersionSnapshots(v.versionNumber, period.startDate, period.endDate);
                    const isActive = !period.endDate;

                    // GHOST FILTER REFINED
                    if (!isActive && versionSnapshots.length === 0) return;

                    // Restoration count: newest is at index 0
                    const rIndex = (v.activePeriods!.length - 1) - index; // This index might be approximated if we merged

                    const startStr = formatSnapshotDate(period.startDate).display;
                    const endStr = period.endDate ? formatSnapshotDate(period.endDate).display : null;
                    const tooltip = endStr
                        ? `Active: ${startStr} – ${endStr}`
                        : `Active since ${startStr}`;

                    // Respect true end date from data
                    virtualList.push({
                        original: v,
                        displayVersion: v.versionNumber,
                        effectiveDate: period.startDate as number,
                        periodStart: period.startDate as number,
                        periodEnd: period.endDate,
                        isRestored: rIndex > 0, // Simplified: if we have multiple periods remaining, older ones are 'restored'
                        restorationIndex: rIndex > 0 ? rIndex : undefined,
                        arrayIndex: index,
                        key: `${v.versionNumber}-${index}`,
                        tooltip
                    });
                });
            } else if (v.startDate !== 0) {
                // Single period (standard) or legacy version without activePeriods
                const versionSnapshots = getVirtualVersionSnapshots(v.versionNumber, v.startDate || 0, v.endDate);
                const isActive = v.versionNumber === activeVersion;

                // GHOST FILTER: Hide if inactive AND has no data
                if (!isActive && versionSnapshots.length === 0) return;

                // Generate Tooltip
                const startStr = formatSnapshotDate(v.startDate || 0).display;
                const endStr = v.endDate ? formatSnapshotDate(v.endDate).display : null;
                const tooltip = endStr
                    ? `Active: ${startStr} – ${endStr}`
                    : `Active since ${startStr}`;

                virtualList.push({
                    original: v,
                    displayVersion: v.versionNumber,
                    effectiveDate: (v.startDate || 0) as number,
                    periodStart: (v.startDate || 0) as number,
                    periodEnd: v.endDate ?? null, // Was hardcoded to null
                    isRestored: false,
                    arrayIndex: 0,
                    key: `${v.versionNumber}-0`,
                    tooltip
                });
            } else if (snapshotsForVersion.length > 0) {
                // DELETED VERSION LOGIC:
                // Group snapshots based on their PRESERVED period metadata
                const periodsMap = new Map<string, { start: number; end: number | null; snapshots: TrafficSnapshot[] }>();

                snapshotsForVersion.forEach(s => {
                    const groupKey = `${s.packagingSnapshot?.periodStart}-${s.packagingSnapshot?.periodEnd}`;
                    if (!periodsMap.has(groupKey)) {
                        periodsMap.set(groupKey, {
                            start: s.packagingSnapshot?.periodStart || 0,
                            end: s.packagingSnapshot?.periodEnd || null,
                            snapshots: []
                        });
                    }
                    periodsMap.get(groupKey)!.snapshots.push(s);
                });


                const sortedPeriods = [...periodsMap.values()].sort((a, b) => b.start - a.start);

                sortedPeriods.forEach((period, index) => {
                    const startStr = formatSnapshotDate(period.start).display;
                    const endStr = period.end ? formatSnapshotDate(period.end).display : null;
                    const tooltip = endStr
                        ? `Active: ${startStr} – ${endStr}`
                        : `Active since ${startStr}`;

                    const isLatestCapturedPeriod = index === 0;

                    virtualList.push({
                        original: v,
                        displayVersion: v.versionNumber,
                        effectiveDate: period.start,
                        periodStart: period.start,
                        periodEnd: isLatestCapturedPeriod ? null : period.end,
                        isRestored: sortedPeriods.length > 1 && index < sortedPeriods.length - 1,
                        restorationIndex: sortedPeriods.length > 1 ? (sortedPeriods.length - 1 - index) : undefined,
                        arrayIndex: index,
                        key: `${v.versionNumber}-${index}-deleted`,
                        tooltip,
                        isDeleted: true // Explicitly track deleted state
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
