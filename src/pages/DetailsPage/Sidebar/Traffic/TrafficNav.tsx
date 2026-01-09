import React, { useState } from 'react';
import { BarChart3, ChevronDown, ChevronRight, MoreVertical } from 'lucide-react';
import { SidebarVersionItem } from '../Packaging/SidebarVersionItem';
import type { PackagingVersion } from '../../../../core/utils/youtubeApi';
import type { TrafficSnapshot } from '../../../../core/types/traffic';
import { SnapshotContextMenu } from './SnapshotContextMenu';
import { ConfirmationModal } from '../../../../components/Shared/ConfirmationModal';

interface TrafficNavProps {
    versions: PackagingVersion[];
    snapshots: TrafficSnapshot[];
    viewingVersion: number | 'draft';
    activeVersion: number | 'draft';
    selectedSnapshot: string | null;
    hasDraft: boolean;
    onVersionClick: (versionNumber: number | 'draft') => void;
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
    activeVersion,
    selectedSnapshot,
    hasDraft,
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
    const [expandedVersions, setExpandedVersions] = useState<Set<number | 'draft'>>(
        new Set([activeVersion]) // Active version auto-expanded
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

    // Sort versions (same as PackagingNav)
    const sortedVersions = [...versions].sort((a, b) => b.versionNumber - a.versionNumber);

    // Determine if there's content to expand
    const hasContent = hasDraft || versions.length > 0;

    // Get snapshots for a specific version
    const getVersionSnapshots = (version: number | 'draft'): TrafficSnapshot[] => {
        if (version === 'draft') return [];

        const filtered = snapshots.filter(s => s.version === version);

        // DEBUG: Log to understand snapshot data
        console.log('[TrafficNav] getVersionSnapshots:', {
            requestedVersion: version,
            allSnapshots: snapshots.map(s => ({ id: s.id, version: s.version, timestamp: s.timestamp })),
            filteredSnapshots: filtered.map(s => ({ id: s.id, version: s.version })),
            filteredCount: filtered.length
        });

        return filtered.sort((a, b) => b.timestamp - a.timestamp); // Latest first
    };

    // Toggle version's snapshots expansion
    const toggleVersionSnapshots = (version: number | 'draft', e: React.MouseEvent) => {
        e.stopPropagation();
        const newExpanded = new Set(expandedVersions);
        if (newExpanded.has(version)) {
            newExpanded.delete(version);
        } else {
            newExpanded.add(version);
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

    return (
        <div className="flex flex-col">
            {/* Level 1: Header Row (matches PackagingNav exactly) */}
            <div className="px-3">
                <div
                    onClick={() => {
                        onSelect();
                        // If not expanded, first expand
                        // If expanded, clicking header goes to active version
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
                    {/* Draft row (if exists) */}
                    {hasDraft && (
                        <SidebarVersionItem
                            label="Draft"
                            isViewing={viewingVersion === 'draft' && !selectedSnapshot}
                            isVideoActive={activeVersion === 'draft'}
                            onClick={() => onVersionClick('draft')}
                        />
                    )}

                    {/* Saved versions */}
                    {sortedVersions.map((version) => {
                        const versionSnapshots = getVersionSnapshots(version.versionNumber);
                        const isVersionExpanded = expandedVersions.has(version.versionNumber);
                        const hasSnapshots = versionSnapshots.length > 0;

                        return (
                            <div key={version.versionNumber}>
                                {/* Version Row with Chevron */}
                                <div className="relative">
                                    <SidebarVersionItem
                                        label={`v.${version.versionNumber}`}
                                        isViewing={viewingVersion === version.versionNumber && !selectedSnapshot}
                                        isVideoActive={activeVersion === version.versionNumber}
                                        onClick={() => onVersionClick(version.versionNumber)}
                                        isParentOfSelected={selectedSnapshot !== null && versionSnapshots.some(s => s.id === selectedSnapshot)}
                                    />

                                    {/* Chevron for snapshots (positioned absolutely) */}
                                    {hasSnapshots && (
                                        <button
                                            onClick={(e) => toggleVersionSnapshots(version.versionNumber, e)}
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
