import React, { useState, useMemo } from 'react';
import { ChevronRight } from 'lucide-react';
import type { PackagingVersion } from '../../../../core/utils/youtubeApi';
import type { TrafficSnapshot } from '../../../../core/types/traffic';
import { Badge } from '../../../../components/ui/atoms/Badge/Badge';

/**
 * BUSINESS LOGIC: Version Snapshot Group
 * 
 * Shows all snapshots for a single version, grouped by activation period.
 * 
 * Example for v.1 with 2 activation periods:
 * 
 * v.1 [Active]
 *   ├─ Jan 7, 2026 [Latest]  ← Current period, latest snapshot
 *   ├─ Jan 5, 2026           ← Current period, older snapshot
 *   └─ Jan 2, 2026 (closed)  ← Old period, closed when v.2 was created
 * 
 * The "(closed)" indicator shows snapshots from periods that are no longer active.
 */

interface VersionSnapshotGroupProps {
    version: PackagingVersion;
    snapshots: TrafficSnapshot[];
    isActive: boolean;
    onSnapshotClick: (snapshotId: string) => void;
}

export const VersionSnapshotGroup: React.FC<VersionSnapshotGroupProps> = ({
    version,
    snapshots,
    isActive,
    onSnapshotClick
}) => {
    const [isExpanded, setIsExpanded] = useState(isActive);

    /**
     * Determine which period each snapshot belongs to.
     * This is important for showing "(closed)" indicator.
     */
    const snapshotsWithPeriodInfo = useMemo(() => {
        return snapshots.map(snapshot => {
            const periodInfo = snapshot.closesVersionPeriod;
            const period = periodInfo && version.activePeriods
                ? version.activePeriods[periodInfo.periodIndex]
                : null;

            return {
                ...snapshot,
                isClosed: period?.endDate !== undefined,
                periodIndex: periodInfo?.periodIndex
            };
        }).sort((a, b) => b.timestamp - a.timestamp); // Sort by timestamp desc (newest first)
    }, [snapshots, version.activePeriods]);

    return (
        <div className="flex flex-col">
            {/* Version header */}
            <div
                onClick={() => setIsExpanded(!isExpanded)}
                className="flex items-center gap-2 pl-[56px] pr-4 py-1.5 cursor-pointer transition-colors rounded-lg ml-6 mr-3 hover:bg-sidebar-hover"
            >
                <span className="text-sm font-medium text-text-primary">v.{version.versionNumber}</span>
                {isActive && (
                    <Badge variant="success" >Active</Badge>
                )}
                <ChevronRight
                    size={12}
                    className={`ml-auto transition-transform text-text-secondary ${isExpanded ? 'rotate-90' : ''}`}
                />
            </div>

            {/* Snapshot list */}
            {isExpanded && (
                <div className="flex flex-col">
                    {snapshotsWithPeriodInfo.length === 0 ? (
                        <div className="pl-[72px] pr-4 py-1.5 text-xs text-text-secondary ml-6 mr-3">
                            No data yet
                        </div>
                    ) : (
                        snapshotsWithPeriodInfo.map((snapshot, index) => (
                            <div
                                key={snapshot.id}
                                onClick={() => onSnapshotClick(snapshot.id)}
                                className="flex items-center gap-2 pl-[72px] pr-4 py-1.5 cursor-pointer transition-colors rounded-lg ml-6 mr-3 hover:bg-sidebar-hover text-text-secondary hover:text-text-primary"
                            >
                                <span className="text-xs">
                                    {new Date(snapshot.timestamp).toLocaleDateString('en-US', {
                                        month: 'short',
                                        day: 'numeric',
                                        year: 'numeric'
                                    })}
                                </span>
                                {index === 0 && !snapshot.isClosed && (
                                    <Badge variant="neutral" >Latest</Badge>
                                )}
                                {snapshot.isClosed && (
                                    <span className="text-xs text-text-tertiary">(closed)</span>
                                )}
                            </div>
                        ))
                    )}
                </div>
            )}
        </div>
    );
};
