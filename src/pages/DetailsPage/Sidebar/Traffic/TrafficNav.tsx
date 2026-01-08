import React, { useState } from 'react';
import { BarChart3, ChevronDown, ChevronRight } from 'lucide-react';
import { SidebarVersionItem } from '../Packaging/SidebarVersionItem';
import type { PackagingVersion } from '../../../../core/utils/youtubeApi';
import type { TrafficSnapshot } from '../../../../core/types/traffic';

interface TrafficNavProps {
    versions: PackagingVersion[];
    snapshots: TrafficSnapshot[];
    viewingVersion: number | 'draft';
    activeVersion: number | 'draft';
    selectedSnapshot: string | null;
    hasDraft: boolean;
    onVersionClick: (versionNumber: number | 'draft') => void;
    onSnapshotClick: (snapshotId: string) => void;
    onSelect: () => void;
    isActive: boolean;
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
    onSelect,
    isActive
}) => {
    // Main expand/collapse state (like PackagingNav)
    const [isExpanded, setIsExpanded] = useState(false);

    // Track which versions have their snapshots expanded
    const [expandedVersions, setExpandedVersions] = useState<Set<number | 'draft'>>(
        new Set([activeVersion]) // Active version auto-expanded
    );

    // Sort versions (same as PackagingNav)
    const sortedVersions = [...versions].sort((a, b) => b.versionNumber - a.versionNumber);

    // Determine if there's content to expand
    const hasContent = hasDraft || versions.length > 0;

    // Get snapshots for a specific version
    const getVersionSnapshots = (version: number | 'draft'): TrafficSnapshot[] => {
        if (version === 'draft') return [];
        return snapshots
            .filter(s => s.version === version)
            .sort((a, b) => b.timestamp - a.timestamp); // Latest first
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
                            setIsExpanded(true);
                        } else {
                            onVersionClick(activeVersion);
                        }
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

                    {/* Expand/Collapse Toggle - Right Side (matches PackagingNav) */}
                    {hasContent && (
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                setIsExpanded(!isExpanded);
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
                                                        ml-6 mr-3 pl-[72px] pr-4 py-1 text-xs cursor-pointer
                                                        transition-colors rounded-lg
                                                        ${isSnapshotSelected
                                                            ? 'text-text-primary font-medium bg-sidebar-active'
                                                            : 'text-text-tertiary hover:text-text-secondary hover:bg-sidebar-hover'
                                                        }
                                                    `}
                                                >
                                                    {display}
                                                    {isLatest && (
                                                        <span className="ml-1 text-text-tertiary font-normal">(latest)</span>
                                                    )}
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
        </div>
    );
};
