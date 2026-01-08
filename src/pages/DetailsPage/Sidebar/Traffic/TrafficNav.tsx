import React, { useState } from 'react';
import { BarChart3, ChevronDown, ChevronRight, FileEdit } from 'lucide-react';
import type { PackagingVersion } from '../../../../core/utils/youtubeApi';
import type { TrafficSnapshot } from '../../../../core/types/traffic';

interface TrafficNavProps {
    versions: PackagingVersion[];
    snapshots: TrafficSnapshot[];
    viewingVersion: number | 'draft';
    activeVersion: number | 'draft';
    selectedSnapshot: string | null; // Snapshot ID if specific snapshot selected
    hasDraft: boolean;
    onVersionClick: (versionNumber: number | 'draft') => void;
    onSnapshotClick: (snapshotId: string) => void;
    onSelect: () => void;
    isActive: boolean;
}

/**
 * BUSINESS LOGIC: Traffic Navigation with 3-Level Hierarchy
 * 
 * Structure:
 * - Level 1: "Suggested Traffic" (main nav item)
 * - Level 2: Versions (v.1, v.2, Draft)
 * - Level 3: Snapshots (CSV uploads with dates)
 * 
 * Behavior:
 * - Active version is expanded by default
 * - Click version → shows data based on Cumulative/Delta toggle
 * - Click snapshot → shows that specific CSV (toggle disabled)
 * - Snapshots show date only, time in tooltip
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
    onSelect,
    isActive
}) => {
    // Track which versions are expanded
    const [expandedVersions, setExpandedVersions] = useState<Set<number | 'draft'>>(
        new Set([activeVersion]) // Active version expanded by default
    );

    // Sort versions: active first, then descending
    const sortedVersions = [...versions].sort((a, b) => {
        const aIsActive = a.versionNumber === activeVersion;
        const bIsActive = b.versionNumber === activeVersion;
        if (aIsActive && !bIsActive) return -1;
        if (!aIsActive && bIsActive) return 1;
        return b.versionNumber - a.versionNumber;
    });

    // Get snapshots for a specific version
    const getVersionSnapshots = (version: number | 'draft'): TrafficSnapshot[] => {
        if (version === 'draft') return [];
        return snapshots
            .filter(s => s.version === version)
            .sort((a, b) => b.timestamp - a.timestamp); // Latest first
    };

    // Toggle version expansion
    const toggleVersion = (version: number | 'draft') => {
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

    const hasContent = hasDraft || versions.length > 0;

    return (
        <div className="flex flex-col">
            {/* Level 1: Main Header */}
            <div className="px-3">
                <div
                    onClick={() => {
                        onSelect();
                        // Navigate to active version
                        onVersionClick(activeVersion);
                    }}
                    className={`
                        w-full h-12 flex items-center gap-4 px-4 text-sm font-medium 
                        transition-colors rounded-lg cursor-pointer text-text-primary
                        ${isActive ? 'bg-sidebar-active' : 'hover:bg-sidebar-hover'}
                    `}
                >
                    {/* Icon */}
                    <span className="flex-shrink-0">
                        <BarChart3 size={24} />
                    </span>

                    {/* Label */}
                    <span className="flex-1">Suggested Traffic</span>
                </div>
            </div>

            {/* Level 2: Versions */}
            {hasContent && (
                <div className="mt-0.5 flex flex-col gap-0.5">
                    {/* Draft */}
                    {hasDraft && (
                        <div className="px-3">
                            <div
                                onClick={() => onVersionClick('draft')}
                                className={`
                                    flex items-center gap-2 px-4 pl-12 py-1.5 text-sm
                                    transition-colors rounded-lg cursor-pointer
                                    ${viewingVersion === 'draft' && !selectedSnapshot
                                        ? 'bg-white/5 text-text-primary'
                                        : 'text-text-secondary hover:text-text-primary hover:bg-white/3'
                                    }
                                `}
                            >
                                <FileEdit size={16} className="flex-shrink-0" />
                                <span className="flex-1">Draft</span>
                                {activeVersion === 'draft' && (
                                    <span className="w-2 h-2 rounded-full bg-accent flex-shrink-0" />
                                )}
                            </div>
                        </div>
                    )}

                    {/* Saved Versions */}
                    {sortedVersions.map((version) => {
                        const versionSnapshots = getVersionSnapshots(version.versionNumber);
                        const isExpanded = expandedVersions.has(version.versionNumber);
                        const isActiveVersion = version.versionNumber === activeVersion;
                        const isSelected = viewingVersion === version.versionNumber && !selectedSnapshot;

                        return (
                            <div key={version.versionNumber} className="px-3">
                                {/* Version Row */}
                                <div
                                    className={`
                                        flex items-center gap-2 px-4 pl-12 py-1.5 text-sm
                                        transition-colors rounded-lg cursor-pointer
                                        ${isSelected
                                            ? 'bg-white/5 text-text-primary'
                                            : 'text-text-secondary hover:text-text-primary hover:bg-white/3'
                                        }
                                    `}
                                >
                                    {/* Expand/Collapse Icon */}
                                    {versionSnapshots.length > 0 && (
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                toggleVersion(version.versionNumber);
                                            }}
                                            className="flex-shrink-0 hover:text-text-primary transition-colors"
                                        >
                                            {isExpanded ? (
                                                <ChevronDown size={14} />
                                            ) : (
                                                <ChevronRight size={14} />
                                            )}
                                        </button>
                                    )}

                                    {/* Version Label */}
                                    <div
                                        onClick={() => onVersionClick(version.versionNumber)}
                                        className="flex-1 flex items-center gap-2"
                                    >
                                        <span>v.{version.versionNumber}</span>
                                        {isActiveVersion && (
                                            <span className="w-2 h-2 rounded-full bg-accent flex-shrink-0" />
                                        )}
                                    </div>
                                </div>

                                {/* Level 3: Snapshots */}
                                {isExpanded && versionSnapshots.length > 0 && (
                                    <div className="mt-0.5 flex flex-col gap-0.5">
                                        {versionSnapshots.map((snapshot, index) => {
                                            const { display, tooltip } = formatSnapshotDate(snapshot.timestamp);
                                            const isSnapshotSelected = selectedSnapshot === snapshot.id;
                                            const isLatest = index === 0;

                                            return (
                                                <div
                                                    key={snapshot.id}
                                                    onClick={() => onSnapshotClick(snapshot.id)}
                                                    title={tooltip}
                                                    className={`
                                                        flex items-center gap-2 px-4 pl-20 py-1 text-xs
                                                        transition-colors rounded-lg cursor-pointer
                                                        ${isSnapshotSelected
                                                            ? 'bg-white/5 text-text-primary'
                                                            : 'text-text-tertiary hover:text-text-secondary hover:bg-white/3'
                                                        }
                                                    `}
                                                >
                                                    <span className="flex-1">
                                                        {display}
                                                        {isLatest && (
                                                            <span className="ml-1 text-text-tertiary">(latest)</span>
                                                        )}
                                                    </span>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}

                                {/* No Snapshots Placeholder */}
                                {isExpanded && versionSnapshots.length === 0 && (
                                    <div className="px-4 pl-20 py-1 text-xs text-text-tertiary italic">
                                        No snapshots yet
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
};
