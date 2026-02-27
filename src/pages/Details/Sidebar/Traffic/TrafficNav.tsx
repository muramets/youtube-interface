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
    groups: TrafficGroup[]; // For niche calculation
    displayedSources: TrafficSource[]; // Current data for stats
    viewingVersion: number | 'draft';
    activeVersion: number | 'draft';
    selectedSnapshot: string | null;
    publishDate?: number;
    onVersionClick: (versionNumber: number | 'draft') => void;
    onSnapshotClick: (snapshotId: string) => void;
    onDeleteSnapshot?: (snapshotId: string) => void;
    onUpdateSnapshotMetadata?: (snapshotId: string, metadata: { label?: string; activeDate?: { start: number; end: number } | null }) => void;
    onReassignVersion?: (snapshotId: string, newVersion: number) => void;
    onSelect: () => void;
    isActive: boolean;
    isExpanded: boolean;
    onToggle: () => void;
    onNicheClick: (nicheId: string) => void;
    activeNicheId: string | null;
}

/**
 * Traffic Navigation with 3-Level Hierarchy
 * 
 * Structure:
 * - Level 1: "Suggested Traffic" header
 * - Level 2: Versions (grouped by snapshot.version)
 * - Level 3: Snapshots (sorted by timestamp, latest first)
 */
export const TrafficNav: React.FC<TrafficNavProps> = ({
    versions,
    snapshots,
    groups,
    displayedSources,
    viewingVersion,
    activeVersion,
    selectedSnapshot,
    publishDate,
    onVersionClick,
    onSnapshotClick,
    onDeleteSnapshot,
    onUpdateSnapshotMetadata,
    onReassignVersion,
    onSelect,
    isActive,
    isExpanded,
    onToggle,
    onNicheClick,
    activeNicheId
}) => {
    // Track which versions have their snapshots expanded
    const [expandedVersions, setExpandedVersions] = useState<Set<string>>(
        new Set([`${activeVersion}`])
    );

    // Auto-expand the active version when activeVersion changes
    React.useEffect(() => {
        const key = `${activeVersion}`;
        setExpandedVersions(prev => {
            if (prev.has(key)) return prev;
            const next = new Set(prev);
            next.add(key);
            return next;
        });
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

    // Metadata editing state
    const [renamingSnapshotId, setRenamingSnapshotId] = useState<string | null>(null);
    const [activeDateSnapshotId, setActiveDateSnapshotId] = useState<string | null>(null);

    // Calculate Niche Stats for the SELECTED snapshot
    const selectedSnapshotNicheStats = useMemo(() => {
        if (!selectedSnapshot || !groups || !displayedSources) return { stats: {}, metricType: 'impressions' as const };

        const stats: Record<string, number> = {};

        const hasImpressions = displayedSources.some(s => (s.impressions || 0) > 0);
        const metricType = hasImpressions ? 'impressions' as const : 'views' as const;

        displayedSources.forEach(source => {
            if (!source.videoId) return;

            const videoGroups = groups.filter(g => g.videoIds.includes(source.videoId!));
            videoGroups.forEach(g => {
                const weight = metricType === 'views' ? (source.views || 0) : (source.impressions || 0);
                stats[g.id] = (stats[g.id] || 0) + weight;
            });
        });

        return { stats, metricType };
    }, [selectedSnapshot, groups, displayedSources]);

    // Toggle version's snapshots expansion
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

    // Use simplified hook for version grouping
    const {
        sortedVersions,
        formatSnapshotDate
    } = useTrafficVersions({
        versions,
        snapshots,
        activeVersion,
        publishDate
    });

    // Determine if there's content to expand
    const hasContent = sortedVersions.length > 0;

    // Auto-expand version containing selected snapshot
    React.useEffect(() => {
        if (selectedSnapshot) {
            const versionWithSnapshot = sortedVersions.find(
                group => group.snapshots.some(s => s.id === selectedSnapshot)
            );
            if (versionWithSnapshot) {
                setExpandedVersions(prev => {
                    if (prev.has(versionWithSnapshot.key)) return prev;
                    const next = new Set(prev);
                    next.add(versionWithSnapshot.key);
                    return next;
                });
            }
        }
    }, [selectedSnapshot, sortedVersions]);

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
                    {sortedVersions.map((group) => {
                        const versionSnapshots = group.snapshots;
                        const isVersionExpanded = expandedVersions.has(group.key);
                        const hasSnapshots = versionSnapshots.length > 0;

                        // Check if packaging was deleted
                        const deletedSnapshotCount = versionSnapshots.filter(s => s.isPackagingDeleted).length;
                        const isPackagingDeleted = group.isDeleted || deletedSnapshotCount > 0;
                        const packagingData = versionSnapshots.find(s => s.isPackagingDeleted)?.packagingSnapshot;

                        const displayLabel = `v.${group.versionNumber}`;

                        return (
                            <div key={group.key}>
                                {/* Version Row with Chevron */}
                                <div>
                                    {isPackagingDeleted && packagingData ? (
                                        <PortalTooltip
                                            content={<PackagingSnapshotTooltip version={group.versionNumber} data={packagingData} />}
                                            variant="glass"
                                            side="right"
                                            align="center"
                                            triggerClassName="w-full"
                                        >
                                            <div className="w-full">
                                                <SidebarVersionItem
                                                    label={displayLabel}
                                                    isDeleted={true}
                                                    isViewing={viewingVersion === group.versionNumber && !selectedSnapshot}
                                                    isVideoActive={group.isActive}
                                                    onClick={() => onVersionClick(group.versionNumber)}
                                                    isParentOfSelected={selectedSnapshot !== null && versionSnapshots.some(s => s.id === selectedSnapshot)}
                                                    action={hasSnapshots && (
                                                        <button
                                                            onClick={(e) => toggleVersionSnapshots(group.key, e)}
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
                                            isViewing={viewingVersion === group.versionNumber && !selectedSnapshot}
                                            isVideoActive={group.isActive}
                                            onClick={() => onVersionClick(group.versionNumber)}
                                            isParentOfSelected={selectedSnapshot !== null && versionSnapshots.some(s => s.id === selectedSnapshot)}
                                            action={hasSnapshots && (
                                                <button
                                                    onClick={(e) => toggleVersionSnapshots(group.key, e)}
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
                availableVersions={versions.map(v => v.versionNumber)}
                currentVersion={menuState.snapshotId ? (snapshots.find(s => s.id === menuState.snapshotId)?.version ?? 0) : 0}
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
                onMoveToVersion={onReassignVersion ? (newVersion) => {
                    if (menuState.snapshotId) {
                        onReassignVersion(menuState.snapshotId, newVersion);
                    }
                } : undefined}
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
