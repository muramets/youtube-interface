import React, { useState } from 'react';
import { BarChart3, ChevronDown, ChevronRight } from 'lucide-react';
import { SidebarVersionItem } from '../Packaging/SidebarVersionItem';
import { SidebarNavHeader } from '../SidebarNavHeader';
import { SidebarSnapshotItem } from './components/SidebarSnapshotItem';
import { PortalTooltip } from '../../../../components/Shared/PortalTooltip';
import { PackagingSnapshotTooltip } from './components/PackagingSnapshotTooltip';
import { useTrafficVersions } from './hooks/useTrafficVersions';
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
 * - Level 1: "Suggested Traffic" header with chevron toggle (via SidebarNavHeader)
 * - Level 2: Versions (via SidebarVersionItem)
 * - Level 3: Snapshots (custom sub-items via SidebarSnapshotItem)
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
    // Stores strings to support composite keys "vNum-index"
    const [expandedVersions, setExpandedVersions] = useState<Set<string>>(
        new Set([`${activeVersion}-0`])
    );

    // Effect to auto-expand active version on mount or change
    React.useEffect(() => {
        // Auto-expansion logic can be refined here if needed
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

    // Use custom hook for version logic
    const {
        sortedVersions,
        getVirtualVersionSnapshots,
        formatSnapshotDate
    } = useTrafficVersions({
        versions,
        snapshots,
        activeVersion,
        isVideoPublished
    });

    // Determine if there's content to expand
    const hasContent = sortedVersions.length > 0;

    return (
        <div className="flex flex-col">
            {/* Level 1: Header Row */}
            <SidebarNavHeader
                icon={<BarChart3 size={24} />}
                title="Suggested Traffic"
                isActive={isActive}
                isExpanded={isExpanded}
                hasContent={hasContent}
                onClick={() => {
                    onSelect();
                    if (!isExpanded && hasContent) {
                        onToggle();
                    } else {
                        onVersionClick(activeVersion);
                    }
                }}
                onToggle={(e) => {
                    e.stopPropagation();
                    onToggle();
                }}
            />

            {/* Level 2: Version List (expanded) */}
            {isExpanded && hasContent && (
                <div className="flex flex-col gap-1 py-1">
                    {/* Saved versions */}
                    {sortedVersions.map((item) => {
                        const versionSnapshots = getVirtualVersionSnapshots(item.displayVersion, item.periodStart, item.periodEnd);
                        const isVersionExpanded = expandedVersions.has(item.key);
                        const hasSnapshots = versionSnapshots.length > 0;

                        // Check if packaging was deleted (any snapshot has isPackagingDeleted flag)
                        const deletedSnapshot = versionSnapshots.find(s => s.isPackagingDeleted);
                        const isPackagingDeleted = !!deletedSnapshot;
                        const packagingData = deletedSnapshot?.packagingSnapshot;

                        // Restoration Label
                        const displayLabel = item.restorationIndex
                            ? `v.${item.displayVersion}`
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
                                                    periodStart={item.periodStart}
                                                    periodEnd={item.periodEnd}
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
                                            periodStart={item.periodStart}
                                            periodEnd={item.periodEnd}
                                        />
                                    )}

                                    {/* Chevron for snapshots - RIGHT SIDE */}
                                    {hasSnapshots && (
                                        <button
                                            onClick={(e) => toggleVersionSnapshots(item.key, e)}
                                            className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-text-secondary hover:text-text-primary transition-colors"
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
                                    <div className="flex flex-col gap-1 py-1">
                                        {versionSnapshots.map((snapshot) => {
                                            const { display, tooltip } = formatSnapshotDate(snapshot.timestamp);
                                            const isSnapshotSelected = selectedSnapshot === snapshot.id;

                                            // Find globally latest snapshot (across all versions)
                                            const globalLatestTimestamp = Math.max(...snapshots.map(s => s.timestamp));
                                            const isLatest = snapshot.timestamp === globalLatestTimestamp;

                                            return (
                                                <SidebarSnapshotItem
                                                    key={snapshot.id}
                                                    id={snapshot.id}
                                                    displayDate={display}
                                                    tooltip={tooltip}
                                                    isSelected={isSnapshotSelected}
                                                    isLatest={isLatest}
                                                    canDelete={!!onDeleteSnapshot}
                                                    onClick={() => onSnapshotClick(snapshot.id)}
                                                    menuOpenSnapshotId={menuState.snapshotId}
                                                    onMenuTrigger={(e, id) => {
                                                        const rect = e.currentTarget.getBoundingClientRect();
                                                        setMenuState({
                                                            snapshotId: id,
                                                            position: {
                                                                x: rect.right + 5,
                                                                y: rect.top
                                                            }
                                                        });
                                                    }}
                                                />
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
