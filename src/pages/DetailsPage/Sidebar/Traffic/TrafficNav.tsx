import React, { useState } from 'react';
import { BarChart3, ChevronDown, ChevronRight, MoreVertical } from 'lucide-react';
import { SidebarVersionItem } from '../Packaging/SidebarVersionItem';
import { PortalTooltip } from '../../../../components/Shared/PortalTooltip';
import { PackagingSnapshotTooltip } from './components/PackagingSnapshotTooltip';
import type { PackagingVersion } from '../../../../core/utils/youtubeApi';
import type { TrafficSnapshot } from '../../../../core/types/traffic';
import { SnapshotContextMenu } from './SnapshotContextMenu';
import { ConfirmationModal } from '../../../../components/Shared/ConfirmationModal';

interface TrafficNavProps {
    versions: PackagingVersion[];
    snapshots: TrafficSnapshot[];
    viewingVersion: number | 'draft';
    viewingPeriodIndex?: number;
    activeVersion: number | 'draft';
    selectedSnapshot: string | null;
    isVideoPublished: boolean; // Whether the video has a publishedVideoId
    onVersionClick: (versionNumber: number | 'draft', periodIndex?: number) => void;
    onSnapshotClick: (snapshotId: string) => void;
    onDeleteSnapshot?: (snapshotId: string) => void;
    onSelect: () => void;
    isActive: boolean;
    isExpanded: boolean;
    onToggle: () => void;
}

/**
 * BUSINESS LOGIC: Traffic Navigation with 3-Level Hierarchy
 * 
 * Structure matches PackagingNav for consistency:
 * - Level 1: "Suggested Traffic" header with chevron toggle
 * - Level 2: Versions (using SidebarVersionItem)
 * - Level 3: Snapshots (custom sub-items under versions)
 * 
 * Active version is auto-expanded to show snapshots.
 */
export const TrafficNav: React.FC<TrafficNavProps> = ({
    versions,
    snapshots,
    viewingVersion,
    viewingPeriodIndex,
    activeVersion,
    selectedSnapshot,
    isVideoPublished,
    onVersionClick,
    onSnapshotClick,
    onDeleteSnapshot,
    onSelect,
    isActive,
    isExpanded,
    onToggle
}) => {
    // Main expand/collapse state (managed by parent)

    // Track which versions have their snapshots expanded
    // Stores strings now to support composite keys "vNum-index"
    const [expandedVersions, setExpandedVersions] = useState<Set<string>>(
        new Set([`${activeVersion}-0`]) // Active version auto-expanded? Or active KEY? Ideally we pass activeKey prop. Or search key.
        // For now, let's just default to empty or handle active expansion effect separately.
    );

    // Effect to auto-expand active version on mount or change
    React.useEffect(() => {
        // Find the active key. Usually it's the latest one (index 0 if simple, or find by activeVersion + !periodEnd)
        // Let's iterate allVersions to find the key for active version? 
        // We can't access sortedVersions efficiently here without recalc.
        // Let's just say "v.X-0" is a safe bet for simple cases, but "v.X-1" if restored?
        // Actually, auto-expansion is nice but not critical if complex.
        // Simplified: user clicks header to expand sidebar.
    }, [activeVersion]);

    // Snapshot context menu state
    const [menuState, setMenuState] = useState<{
        snapshotId: string | null;
        position: { x: number; y: number };
    }>({ snapshotId: null, position: { x: 0, y: 0 } });

    // Delete confirmation modal state
    const [deleteConfirmation, setDeleteConfirmation] = useState<{
        isOpen: boolean;
        snapshotId: string | null;
    }>({ isOpen: false, snapshotId: null });

    // Toggle version's snapshots expansion (using composite key)
    const toggleVersionSnapshots = (key: string, e: React.MouseEvent) => {
        e.stopPropagation();
        const newExpanded = new Set(expandedVersions);
        if (newExpanded.has(key)) {
            newExpanded.delete(key);
        } else {
            newExpanded.add(key);
        }
        setExpandedVersions(newExpanded);
    };
    // Format date for snapshot (date only, time in tooltip)
    const formatSnapshotDate = (timestamp: number): { display: string; tooltip: string } => {
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

    // Get snapshots for a specific VIRTUAL version period
    const getVirtualVersionSnapshots = (version: number, start: number, end?: number | null): TrafficSnapshot[] => {
        return snapshots.filter(s => {
            if (s.version !== version) return false;
            // Strict timestamp check: must be >= start AND (if end exists) <= end
            // Adding small buffer (5000ms) to ensure boundary inclusions if latency occurred
            // Clock skew or millisecond differences might cause a snapshot to appear "before" a period started
            const matchesStart = s.timestamp >= (start - 5000);
            const matchesEnd = end ? s.timestamp <= (end + 5000) : true;
            return matchesStart && matchesEnd;
        }).sort((a, b) => b.timestamp - a.timestamp); // Latest first
    };

    // Sort versions (same as PackagingNav)
    // MERGE LOGIC: Combine active packaging versions with versions found in snapshots (even if deleted)
    // FILTER LOGIC: For unpublished videos, only show versions that have traffic snapshots
    // EXPANDED LOGIC: Create "Virtual Versions" for each active period to show usage timeline
    const sortedVersions = React.useMemo(() => {
        const packagingVersionSet = new Set(versions.map(v => v.versionNumber));
        const snapshotVersionSet = new Set(snapshots.map(s => s.version));

        // Find versions that exist in snapshots but NOT in packaging history (deleted versions)
        const deletedVersionNumbers = [...snapshotVersionSet].filter(v => !packagingVersionSet.has(v));

        // Create placeholders for deleted versions
        const deletedVersions: PackagingVersion[] = deletedVersionNumbers.map(vNum => ({
            versionNumber: vNum,
            startDate: 0, // Placeholder
            checkins: [],
            configurationSnapshot: { title: '', description: '', tags: [], coverImage: null }
        }));

        // Combine all raw versions
        let allVersions = [...versions, ...deletedVersions];

        // Virtual Expansion Helper
        const virtualList: Array<{
            original: PackagingVersion;
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
                v.activePeriods.forEach((period, index) => {
                    const snapshots = getVirtualVersionSnapshots(v.versionNumber, period.startDate, period.endDate);
                    const isActive = !period.endDate;

                    // GHOST FILTER REFINED:
                    // Hide period if it is NOT active AND has NO snapshots
                    if (!isActive && snapshots.length === 0) return;


                    // Restoration count: newest is at index 0, oldest is at index length-1
                    const rIndex = (v.activePeriods!.length - 1) - index;

                    // Generate Tooltip
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
            // Only show restoration index if this version number appears more than once
            showRestored: versionCounts[item.displayVersion] > 1
        }));

        return sortedResults;
    }, [versions, snapshots, activeVersion, isVideoPublished]);

    // Determine if there's content to expand
    const hasContent = sortedVersions.length > 0;







    return (
        <div className="flex flex-col">
            {/* Level 1: Header Row (matches PackagingNav exactly) */}
            <div className="px-3">
                <div
                    onClick={() => {
                        onSelect();
                        if (!isExpanded && hasContent) {
                            onToggle();
                        } else {
                            onVersionClick(activeVersion);
                        }
                    }}
                    className={`
                        w-full h-12 flex items-center gap-4 px-4 text-sm 
                        transition-colors rounded-lg cursor-pointer text-text-primary
                        ${isActive ? 'bg-sidebar-active font-semibold' : 'hover:bg-sidebar-hover font-normal'}
                    `}
                >
                    {/* Icon */}
                    <span className="flex-shrink-0">
                        <BarChart3 size={24} />
                    </span>

                    {/* Label */}
                    <span className="flex-1 whitespace-nowrap">Suggested Traffic</span>

                    {/* Expand/Collapse Toggle - Right Side (matches PackagingNav) */}
                    {hasContent && (
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                onToggle();
                            }}
                            className="p-1 text-text-secondary hover:text-text-primary transition-colors"
                        >
                            {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                        </button>
                    )}
                </div>
            </div>

            {/* Level 2: Version List (expanded) */}
            {isExpanded && hasContent && (
                <div className="flex flex-col gap-1 py-1">
                    {/* Saved versions */}
                    {sortedVersions.map((item) => {
                        const versionSnapshots = getVirtualVersionSnapshots(item.displayVersion, item.periodStart, item.periodEnd);
                        // Cast expandedVersions has check to support string keys. 
                        // Note: Initial state in useState was Set<number|draft>, we are abusing it to hold strings.
                        // Ideally we should fix the interface or state initialization.
                        const isVersionExpanded = expandedVersions.has(item.key as any);
                        const hasSnapshots = versionSnapshots.length > 0;

                        // Check if packaging was deleted (any snapshot has isPackagingDeleted flag)
                        const deletedSnapshot = versionSnapshots.find(s => s.isPackagingDeleted);
                        const isPackagingDeleted = !!deletedSnapshot;
                        const packagingData = deletedSnapshot?.packagingSnapshot;

                        // Restoration Label
                        const displayLabel = item.restorationIndex
                            ? `v.${item.displayVersion}` // We can add " (Clone)" if needed but sidebar item handles badge
                            : `v.${item.displayVersion}`;

                        return (
                            <div key={item.key}>
                                {/* Version Row with Chevron */}
                                <div className="relative">
                                    {isPackagingDeleted && packagingData ? (
                                        <PortalTooltip
                                            content={<PackagingSnapshotTooltip version={item.displayVersion} data={packagingData} />}
                                            variant="glass"
                                            side="right"
                                            align="center"
                                            triggerClassName="w-full"
                                        >
                                            <div className="w-full">
                                                <SidebarVersionItem
                                                    label={displayLabel}
                                                    isDeleted={true}
                                                    isViewing={viewingVersion === item.displayVersion && viewingPeriodIndex === item.arrayIndex && !selectedSnapshot}
                                                    isVideoActive={activeVersion === item.displayVersion && !item.periodEnd} // Only active if it's the CURRENT period
                                                    onClick={() => onVersionClick(item.displayVersion, item.arrayIndex)}
                                                    isParentOfSelected={selectedSnapshot !== null && versionSnapshots.some(s => s.id === selectedSnapshot)}
                                                    restorationIndex={item.showRestored ? item.restorationIndex : undefined}
                                                    tooltip={item.tooltip}
                                                />
                                            </div>
                                        </PortalTooltip>
                                    ) : (
                                        <SidebarVersionItem
                                            label={displayLabel}
                                            isDeleted={isPackagingDeleted}
                                            isViewing={viewingVersion === item.displayVersion && viewingPeriodIndex === item.arrayIndex && !selectedSnapshot}
                                            isVideoActive={activeVersion === item.displayVersion && !item.periodEnd}
                                            onClick={() => onVersionClick(item.displayVersion, item.arrayIndex)}
                                            isParentOfSelected={selectedSnapshot !== null && versionSnapshots.some(s => s.id === selectedSnapshot)}
                                            restorationIndex={item.showRestored ? item.restorationIndex : undefined}
                                            tooltip={item.tooltip}
                                        />
                                    )}

                                    {/* Chevron for snapshots (positioned absolutely) */}
                                    {hasSnapshots && (
                                        <button
                                            onClick={(e) => toggleVersionSnapshots(item.key, e)}
                                            className="absolute left-[40px] top-1/2 -translate-y-1/2 p-1 text-text-secondary hover:text-text-primary transition-colors"
                                        >
                                            {isVersionExpanded ? (
                                                <ChevronDown size={12} />
                                            ) : (
                                                <ChevronRight size={12} />
                                            )}
                                        </button>
                                    )}
                                </div>

                                {/* Level 3: Snapshots (sub-items under version) */}
                                {isVersionExpanded && hasSnapshots && (
                                    <div className="flex flex-col gap-0.5 py-0.5">
                                        {versionSnapshots.map((snapshot) => {
                                            const { display, tooltip } = formatSnapshotDate(snapshot.timestamp);
                                            const isSnapshotSelected = selectedSnapshot === snapshot.id;

                                            // Find globally latest snapshot (across all versions)
                                            const globalLatestTimestamp = Math.max(...snapshots.map(s => s.timestamp));
                                            const isLatest = snapshot.timestamp === globalLatestTimestamp;

                                            return (
                                                <div
                                                    key={snapshot.id}
                                                    className="group/snapshot relative"
                                                >
                                                    <div
                                                        onClick={() => onSnapshotClick(snapshot.id)}
                                                        title={tooltip}
                                                        className={`
                                                            ml-12 mr-3 pl-12 pr-8 py-1.5 text-xs cursor-pointer
                                                            transition-colors rounded-lg relative
                                                            ${isSnapshotSelected
                                                                ? 'text-text-primary font-medium bg-sidebar-active'
                                                                : 'text-text-tertiary hover:text-text-secondary hover:bg-sidebar-hover font-normal'
                                                            }
                                                        `}
                                                    >
                                                        {display}
                                                        {isLatest && (
                                                            <span className="ml-1 text-text-tertiary font-normal">(latest)</span>
                                                        )}

                                                        {/* MoreVertical Icon - Only for latest snapshot (LIFO policy) */}
                                                        {isLatest && onDeleteSnapshot && (
                                                            <button
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    const rect = e.currentTarget.getBoundingClientRect();
                                                                    setMenuState({
                                                                        snapshotId: snapshot.id,
                                                                        position: {
                                                                            x: rect.right + 5,
                                                                            y: rect.top
                                                                        }
                                                                    });
                                                                }}
                                                                className={`
                                                                    absolute right-2 top-1/2 -translate-y-1/2
                                                                    p-0.5 rounded-full transition-opacity
                                                                    ${menuState.snapshotId === snapshot.id
                                                                        ? 'opacity-100 bg-white/10'
                                                                        : 'opacity-0 group-hover/snapshot:opacity-100 hover:bg-white/10'
                                                                    }
                                                                `}
                                                            >
                                                                <MoreVertical size={12} />
                                                            </button>
                                                        )}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Snapshot Context Menu */}
            <SnapshotContextMenu
                isOpen={menuState.snapshotId !== null}
                onClose={() => setMenuState({ snapshotId: null, position: { x: 0, y: 0 } })}
                position={menuState.position}
                onDelete={() => {
                    if (menuState.snapshotId) {
                        setDeleteConfirmation({ isOpen: true, snapshotId: menuState.snapshotId });
                    }
                }}
            />

            {/* Delete Confirmation Modal */}
            <ConfirmationModal
                isOpen={deleteConfirmation.isOpen}
                onClose={() => setDeleteConfirmation({ isOpen: false, snapshotId: null })}
                onConfirm={() => {
                    if (deleteConfirmation.snapshotId && onDeleteSnapshot) {
                        onDeleteSnapshot(deleteConfirmation.snapshotId);
                    }
                    setDeleteConfirmation({ isOpen: false, snapshotId: null });
                }}
                title="Delete Snapshot"
                message="Are you sure you want to delete this snapshot? This action cannot be undone."
                confirmLabel="Delete"
            />
        </div>
    );
};
