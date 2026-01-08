import React, { useState, useMemo } from 'react';
import { BarChart3, ChevronDown } from 'lucide-react';
import type { PackagingVersion } from '../../../../core/utils/youtubeApi';
import type { TrafficSnapshot } from '../../../../core/types/traffic';
import { VersionSnapshotGroup } from './VersionSnapshotGroup';

/**
 * BUSINESS LOGIC: Traffic Snapshot Navigation
 * 
 * This sidebar section shows all traffic snapshots grouped by version.
 * 
 * Structure:
 * - Versions are listed in descending order (v.3, v.2, v.1)
 * - Each version shows its snapshots in chronological order
 * - Active version is highlighted
 * - Latest snapshot for each version is marked
 * 
 * Clicking a snapshot:
 * - Navigates to Traffic tab
 * - Filters data based on selected view mode (Cumulative/Delta)
 * - Highlights the selected snapshot in the timeline
 */

interface SuggestedTrafficNavProps {
    versions: PackagingVersion[];
    activeVersion: number | 'draft';
    snapshots: TrafficSnapshot[];
    onSnapshotClick: (snapshotId: string) => void;
    onNavigateToTraffic: () => void;
}

export const SuggestedTrafficNav: React.FC<SuggestedTrafficNavProps> = ({
    versions,
    activeVersion,
    snapshots,
    onSnapshotClick,
    onNavigateToTraffic
}) => {
    const [isExpanded, setIsExpanded] = useState(false);

    /**
     * Group snapshots by version number.
     * Each version can have multiple snapshots from different activation periods.
     */
    const snapshotsByVersion = useMemo(() => {
        return snapshots.reduce((acc, snapshot) => {
            if (!acc[snapshot.version]) {
                acc[snapshot.version] = [];
            }
            acc[snapshot.version].push(snapshot);
            return acc;
        }, {} as Record<number, TrafficSnapshot[]>);
    }, [snapshots]);

    /**
     * Sort versions in descending order (newest first)
     */
    const sortedVersions = useMemo(() => {
        return [...versions].sort((a, b) => b.versionNumber - a.versionNumber);
    }, [versions]);

    return (
        <div className="flex flex-col">
            {/* Header - similar to PackagingNav */}
            <div
                onClick={() => {
                    setIsExpanded(!isExpanded);
                    if (!isExpanded) {
                        onNavigateToTraffic();
                    }
                }}
                className="w-full h-12 flex items-center gap-4 px-4 text-sm font-medium transition-colors rounded-lg cursor-pointer text-text-primary hover:bg-sidebar-hover"
            >
                <span className="flex-shrink-0">
                    <BarChart3 size={24} />
                </span>
                <span className="flex-1">Suggested Traffic</span>
                <ChevronDown
                    size={16}
                    className={`transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                />
            </div>

            {/* Expanded list */}
            {isExpanded && (
                <div className="flex flex-col gap-1 py-1">
                    {sortedVersions.length === 0 ? (
                        <div className="pl-[56px] pr-4 py-1.5 text-xs text-text-secondary ml-6 mr-3">
                            No versions yet
                        </div>
                    ) : (
                        sortedVersions.map(version => (
                            <VersionSnapshotGroup
                                key={version.versionNumber}
                                version={version}
                                snapshots={snapshotsByVersion[version.versionNumber] || []}
                                isActive={activeVersion === version.versionNumber}
                                onSnapshotClick={onSnapshotClick}
                            />
                        ))
                    )}
                </div>
            )}
        </div>
    );
};
