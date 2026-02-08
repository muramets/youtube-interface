import React, { useState, useMemo } from 'react';
import { BarChart3, ChevronDown, ChevronRight } from 'lucide-react';
import { SidebarVersionItem } from '../Packaging/SidebarVersionItem';
import { SidebarNavHeader } from '../SidebarNavHeader';
import { SidebarSnapshotItem } from './components/SidebarSnapshotItem';
import { PortalTooltip } from '../../../../components/ui/atoms/PortalTooltip';
import { PackagingSnapshotTooltip } from './components/PackagingSnapshotTooltip';
import { useTrafficVersions } from './hooks/useTrafficVersions';
import type { PackagingVersion } from '../../../../core/utils/youtubeApi';
import type { TrafficSnapshot, TrafficGroup, TrafficSource } from '../../../../core/types/traffic';
import { SnapshotContextMenu } from './SnapshotContextMenu';
import { ConfirmationModal } from '../../../../components/ui/organisms/ConfirmationModal';

interface TrafficNavProps {
    versions: PackagingVersion[];
    snapshots: TrafficSnapshot[];
    groups: TrafficGroup[]; // NEW: For niche calculation
    displayedSources: TrafficSource[]; // NEW: Current data for stats
    viewingVersion: number | 'draft';
    viewingPeriodIndex?: number;
    activeVersion: number | 'draft';
    selectedSnapshot: string | null;
    isVideoPublished: boolean; // Whether the video has a publishedVideoId
    onVersionClick: (versionNumber: number | 'draft', periodIndex?: number) => void;
    onSnapshotClick: (snapshotId: string) => void;
    onDeleteSnapshot?: (snapshotId: string) => void;
    onUpdateSnapshotMetadata?: (snapshotId: string, metadata: { label?: string; activeDate?: { start: number; end: number } | null }) => void;
    onSelect: () => void;
    isActive: boolean;
    isExpanded: boolean;
    onToggle: () => void;
    onNicheClick: (nicheId: string) => void;
    activeNicheId: string | null;
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
    groups,
    displayedSources,
    viewingVersion,
    viewingPeriodIndex,
    activeVersion,
    selectedSnapshot,
    isVideoPublished,
    onVersionClick,
    onSnapshotClick,
    onDeleteSnapshot,
    onUpdateSnapshotMetadata,
    onSelect,
    isActive,
    isExpanded,
    onToggle,
    onNicheClick,
    activeNicheId
}) => {
    // Main expand/collapse state (managed by parent)

    // Track which versions have their snapshots expanded
    // Stores strings to support composite keys "vNum-index"
    const [expandedVersions, setExpandedVersions] = useState<Set<string>>(
        new Set([`${activeVersion}-0`])
    );

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

    // Optimistic deletion: locally hidden snapshots (instant visual removal)
    const [hiddenSnapshotIds, setHiddenSnapshotIds] = useState<Set<string>>(new Set());

    // Metadata editing state
    const [renamingSnapshotId, setRenamingSnapshotId] = useState<string | null>(null);
    const [activeDateSnapshotId, setActiveDateSnapshotId] = useState<string | null>(null);


    // Calculate Niche Stats for the SELECTED snapshot
    // We rely on displayedSources being the source of truth (already filtered by view mode)
    const selectedSnapshotNicheStats = useMemo(() => {
        if (!selectedSnapshot || !groups || !displayedSources) return { stats: {}, metricType: 'impressions' as const };

        const stats: Record<string, number> = {};

        // Check if we have valid impressions in the dataset
        const hasImpressions = displayedSources.some(s => (s.impressions || 0) > 0);
        const metricType = hasImpressions ? 'impressions' as const : 'views' as const;

        displayedSources.forEach(source => {
            if (!source.videoId) return;

            // Find which groups this video belongs to
            const videoGroups = groups.filter(g => g.videoIds.includes(source.videoId!));

            videoGroups.forEach(g => {
                // FALLBACK LOGIC: If we determined we are using views, use views. Otherwise use impressions.
                const weight = metricType === 'views' ? (source.views || 0) : (source.impressions || 0);
                stats[g.id] = (stats[g.id] || 0) + weight;
            });
        });

        return { stats, metricType };
    }, [selectedSnapshot, groups, displayedSources]);

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

    // Effect to auto-expand active version on mount or auto-expand when a snapshot is selected
    React.useEffect(() => {
        // 1. If a snapshot is selected, find which version contains it and expand that version
        if (selectedSnapshot) {
            const itemsToExpand = new Set<string>();

            // Check each sorted version for the selected snapshot
            sortedVersions.forEach(versionItem => {
                const snapshotsInVersion = getVirtualVersionSnapshots(
                    versionItem.displayVersion,
                    versionItem.periodStart,
                    versionItem.periodEnd
                );

                if (snapshotsInVersion.some(s => s.id === selectedSnapshot)) {
                    itemsToExpand.add(versionItem.key);
                }
            });

            if (itemsToExpand.size > 0) {
                setExpandedVersions(prev => {
                    // Only update if we have new items to expand that aren't already expanded
                    const next = new Set(prev);
                    let changed = false;

                    itemsToExpand.forEach(key => {
                        if (!next.has(key)) {
                            next.add(key);
                            changed = true;
                        }
                    });

                    return changed ? next : prev;
                });
            }
        }
    }, [selectedSnapshot, sortedVersions, getVirtualVersionSnapshots]);

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
                        const versionSnapshots = getVirtualVersionSnapshots(item.displayVersion, item.periodStart, item.periodEnd)
                            .filter(s => !hiddenSnapshotIds.has(s.id));
                        const isVersionExpanded = expandedVersions.has(item.key);
                        const hasSnapshots = versionSnapshots.length > 0;

                        // Check if packaging was deleted (item flag or any snapshot has isPackagingDeleted flag)
                        const deletedSnapshotCount = versionSnapshots.filter(s => s.isPackagingDeleted).length;
                        const isPackagingDeleted = item.isDeleted || deletedSnapshotCount > 0;
                        const packagingData = versionSnapshots.find(s => s.isPackagingDeleted)?.packagingSnapshot;

                        // Restoration Label
                        const displayLabel = item.restorationIndex
                            ? `v.${item.displayVersion}`
                            : `v.${item.displayVersion}`;

                        return (
                            <div key={item.key}>
                                {/* Version Row with Chevron */}
                                <div>
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
                                                    isVideoActive={activeVersion === item.displayVersion && !item.periodEnd}
                                                    onClick={() => onVersionClick(item.displayVersion, item.arrayIndex)}
                                                    isParentOfSelected={selectedSnapshot !== null && versionSnapshots.some(s => s.id === selectedSnapshot)}
                                                    restorationIndex={item.showRestored ? item.restorationIndex : undefined}
                                                    periodStart={item.periodStart}
                                                    periodEnd={item.periodEnd}
                                                    truncatePeriodBadge={true}
                                                    action={hasSnapshots && (
                                                        <button
                                                            onClick={(e) => toggleVersionSnapshots(item.key, e)}
                                                            className="p-1 text-text-secondary hover:text-text-primary transition-colors rounded"
                                                        >
                                                            {isVersionExpanded ? (
                                                                <ChevronDown size={12} />
                                                            ) : (
                                                                <ChevronRight size={12} />
                                                            )}
                                                        </button>
                                                    )}
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
                                            truncatePeriodBadge={true}
                                            action={hasSnapshots && (
                                                <button
                                                    onClick={(e) => toggleVersionSnapshots(item.key, e)}
                                                    className="p-1 text-text-secondary hover:text-text-primary transition-colors rounded"
                                                >
                                                    {isVersionExpanded ? (
                                                        <ChevronDown size={12} />
                                                    ) : (
                                                        <ChevronRight size={12} />
                                                    )}
                                                </button>
                                            )}
                                        />
                                    )}
                                </div>

                                {/* Level 3: Snapshots (sub-items under version) */}
                                {isVersionExpanded && hasSnapshots && (
                                    <div className="flex flex-col gap-1 py-1">
                                        {versionSnapshots.map((snapshot) => {
                                            const { display, tooltip } = formatSnapshotDate(snapshot.timestamp, snapshot);
                                            const isSnapshotSelected = selectedSnapshot === snapshot.id;

                                            // Find globally latest snapshot (across all versions)
                                            const globalLatestTimestamp = Math.max(...snapshots.map(s => s.timestamp));
                                            const isLatest = snapshot.timestamp === globalLatestTimestamp;

                                            return (
                                                <div key={snapshot.id}>
                                                    <SidebarSnapshotItem
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
                                                        // Pass niche stats only if selected
                                                        nicheImpressions={isSnapshotSelected ? selectedSnapshotNicheStats.stats : undefined}
                                                        metricType={isSnapshotSelected ? selectedSnapshotNicheStats.metricType : undefined}
                                                        groups={groups}
                                                        onNicheClick={onNicheClick}
                                                        activeNicheId={activeNicheId}
                                                        // Metadata props
                                                        label={snapshot.label}
                                                        activeDate={snapshot.activeDate}
                                                        onRename={onUpdateSnapshotMetadata ? (id, label) => onUpdateSnapshotMetadata(id, { label: label || undefined }) : undefined}
                                                        onSetActiveDate={onUpdateSnapshotMetadata ? (id, date) => onUpdateSnapshotMetadata(id, { activeDate: date }) : undefined}
                                                        isRenaming={renamingSnapshotId === snapshot.id}
                                                        isSettingActiveDate={activeDateSnapshotId === snapshot.id}
                                                        onStartRename={() => setRenamingSnapshotId(snapshot.id)}
                                                        onStopRename={() => setRenamingSnapshotId(null)}
                                                        onStopSettingActiveDate={() => setActiveDateSnapshotId(null)}
                                                    />
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
                isLatest={menuState.snapshotId ? menuState.snapshotId === snapshots.reduce((latest, s) => s.timestamp > (latest?.timestamp || 0) ? s : latest, snapshots[0])?.id : false}
                canDelete={!!onDeleteSnapshot}
                onDelete={() => {
                    if (menuState.snapshotId) {
                        setDeleteConfirmation({ isOpen: true, snapshotId: menuState.snapshotId });
                    }
                }}
                onRename={() => {
                    if (menuState.snapshotId) {
                        setRenamingSnapshotId(menuState.snapshotId);
                    }
                }}
                onSetActiveDate={() => {
                    if (menuState.snapshotId) {
                        setActiveDateSnapshotId(menuState.snapshotId);
                    }
                }}
            />

            {/* Delete Confirmation Modal */}
            <ConfirmationModal
                isOpen={deleteConfirmation.isOpen}
                onClose={() => setDeleteConfirmation({ isOpen: false, snapshotId: null })}
                onConfirm={() => {
                    if (deleteConfirmation.snapshotId && onDeleteSnapshot) {
                        // Instantly hide snapshot in sidebar (same render frame)
                        setHiddenSnapshotIds(prev => {
                            const next = new Set(prev);
                            next.add(deleteConfirmation.snapshotId!);
                            return next;
                        });
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
