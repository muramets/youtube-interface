import { useMemo, useCallback } from 'react';
import type { TrafficSnapshot } from '../../../../../core/types/traffic';
import type { PackagingVersion as PackagingVersionType, PackagingSnapshot } from '../../../../../core/types/versioning';

interface UseTrafficVersionsProps {
    versions: PackagingVersionType[];
    snapshots: TrafficSnapshot[];
    activeVersion: number | 'draft';
    isVideoPublished: boolean;
}

export const useTrafficVersions = ({
    versions,
    snapshots,
    activeVersion
}: UseTrafficVersionsProps) => {

    // Helper: Get snapshots for a specific virtual period
    const getVirtualVersionSnapshots = useCallback((version: number, start: number, end?: number | null, isFirstPeriod?: boolean): TrafficSnapshot[] => {
        return snapshots.filter(s => {
            if (s.version !== version) return false;
            // Strict timestamp check: must be >= start AND (if end exists) <= end
            // EXCEPTION: If end is null/undefined, we accept all future snapshots (e.g. for active version)
            // For the FIRST period of a version, skip the start-bound check so that
            // snapshots uploaded during draft (before the version was published) survive.
            const matchesStart = isFirstPeriod || s.timestamp >= (start - 5000);
            const matchesEnd = end ? s.timestamp <= (end + 5000) : true;
            return matchesStart && matchesEnd;
        }).sort((a, b) => b.timestamp - a.timestamp); // Latest first
    }, [snapshots]);

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

    const sortedVersions = useMemo(() => {
        const packagingVersionSet = new Set(versions.map(v => v.versionNumber));
        const snapshotVersionSet = new Set(snapshots.map(s => s.version));

        // Find versions that exist in snapshots but NOT in packaging history (deleted versions)
        const deletedVersionNumbers = [...snapshotVersionSet].filter(v => !packagingVersionSet.has(v));

        // When activeVersion is 'draft', v.1 hasn't been published yet.
        // If there are snapshots for v.1, inject a synthetic version so it's
        // handled via the normal single-period path (not the deleted path).
        let extraVersions: PackagingVersionType[] = [];
        if (activeVersion === 'draft' && !packagingVersionSet.has(1) && snapshotVersionSet.has(1)) {
            const draftSnapshots = snapshots.filter(s => s.version === 1);
            const earliestTimestamp = Math.min(...draftSnapshots.map(s => s.timestamp));
            extraVersions = [{
                versionNumber: 1,
                startDate: earliestTimestamp,
                endDate: null,
                revision: 0,
                checkins: [],
                configurationSnapshot: {
                    title: '', description: '', tags: [], coverImage: null,
                } as unknown as PackagingSnapshot,
                activePeriods: [],
            }];
            packagingVersionSet.add(1);
            // Remove v.1 from deleted list since we've synthesized it
            const idx = deletedVersionNumbers.indexOf(1);
            if (idx !== -1) deletedVersionNumbers.splice(idx, 1);
        }

        // Create placeholders for deleted versions
        const deletedVersions: PackagingVersionType[] = deletedVersionNumbers.map(vNum => ({
            versionNumber: vNum,
            startDate: 0,
            endDate: null,
            revision: 0,
            checkins: [],
            configurationSnapshot: {
                title: '',
                description: '',
                tags: [],
                coverImage: null
            } as unknown as PackagingSnapshot,
            activePeriods: []
        }));

        // Combine all raw versions
        const allVersions = [...versions, ...extraVersions, ...deletedVersions];

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
                coalescedPeriods.forEach((period: { startDate: number; endDate: number | null }, index: number) => {
                    const versionSnapshots = getVirtualVersionSnapshots(v.versionNumber, period.startDate, period.endDate, index === 0);
                    const isPeriodOpen = !period.endDate;
                    const isVersionActive = v.versionNumber === activeVersion;
                    const isLastPeriod = index === coalescedPeriods.length - 1;

                    // GHOST FILTER: Hide if period is closed AND version is not active AND no snapshots.
                    // The active version's last period is ALWAYS visible (even if endDate is stale).
                    if (!isPeriodOpen && !(isVersionActive && isLastPeriod) && versionSnapshots.length === 0) return;

                    // Restoration count: newest is at index 0
                    const rIndex = (v.activePeriods!.length - 1) - index; // This index might be approximated if we merged

                    const startStr = formatSnapshotDate(period.startDate).display;
                    const endStr = period.endDate ? formatSnapshotDate(period.endDate).display : null;
                    const tooltip = endStr
                        ? `Active: ${startStr} – ${endStr}`
                        : `Active since ${startStr}`;

                    // For the active version's last period, force open-ended
                    // so getVirtualVersionSnapshots accepts all future snapshots.
                    const effectivePeriodEnd = (isVersionActive && isLastPeriod) ? null : period.endDate;

                    virtualList.push({
                        original: v,
                        displayVersion: v.versionNumber,
                        effectiveDate: period.startDate as number,
                        periodStart: period.startDate as number,
                        periodEnd: effectivePeriodEnd,
                        isRestored: rIndex > 0, // Simplified: if we have multiple periods remaining, older ones are 'restored'
                        restorationIndex: rIndex > 0 ? rIndex : undefined,
                        arrayIndex: index,
                        key: `${v.versionNumber}-${index}`,
                        tooltip
                    });
                });
            } else if (v.startDate !== 0) {
                // Single period (standard) or legacy version without activePeriods
                const versionSnapshots = getVirtualVersionSnapshots(v.versionNumber, v.startDate || 0, v.endDate, true);
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
    }, [versions, snapshots, activeVersion, getVirtualVersionSnapshots, formatSnapshotDate]);

    return {
        sortedVersions,
        getVirtualVersionSnapshots,
        formatSnapshotDate
    };
};
