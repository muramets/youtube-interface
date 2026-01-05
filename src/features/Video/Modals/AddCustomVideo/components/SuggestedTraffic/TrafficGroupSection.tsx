import React from 'react';
import { Edit2, Trash2 } from 'lucide-react';
import type { TrafficGroup, TrafficSource } from '../../../../../../core/types/traffic';
import { TrafficTable } from './TrafficTable';

interface TrafficGroupSectionProps {
    groups: TrafficGroup[];
    trafficData: TrafficSource[];
    selectedIds: Set<string>;
    onToggleSelection: (id: string) => void;
    onToggleAll: (ids: string[]) => void;
    onEditGroup: (group: TrafficGroup) => void;
    onDeleteGroup: (groupId: string) => void;
    onRemoveFromGroup: (groupId: string, videoIds: string[]) => void;
}

export const TrafficGroupSection: React.FC<TrafficGroupSectionProps> = ({
    groups,
    trafficData,
    selectedIds,
    onToggleSelection,
    onToggleAll,
    onEditGroup,
    onDeleteGroup,
    onRemoveFromGroup
}) => {
    if (groups.length === 0) return null;

    const calculateAverage = (sources: TrafficSource[]): TrafficSource => {
        if (sources.length === 0) {
            return {
                sourceType: 'Average',
                sourceTitle: 'Group Average',
                videoId: null,
                impressions: 0,
                ctr: 0,
                views: 0,
                avgViewDuration: '00:00:00',
                watchTimeHours: 0
            };
        }

        const totalImpressions = sources.reduce((sum, s) => sum + s.impressions, 0);
        const totalViews = sources.reduce((sum, s) => sum + s.views, 0);
        const totalWatchTime = sources.reduce((sum, s) => sum + s.watchTimeHours, 0);

        // Weighted CTR average based on impressions? Or simple average?
        // Usually CTR = (Clicks / Impressions) * 100. Clicks = Views (roughly).
        // Let's calculate CTR based on total views / total impressions if possible.
        // But views != clicks exactly.
        // Let's just average the CTR for now, or weighted average.
        // Weighted average by impressions is better: sum(ctr * impressions) / sum(impressions)
        const weightedCtrSum = sources.reduce((sum, s) => sum + (s.ctr * s.impressions), 0);
        const avgCtr = totalImpressions > 0 ? weightedCtrSum / totalImpressions : 0;

        // Average duration in seconds
        const totalDurationSeconds = sources.reduce((sum, s) => {
            const parts = s.avgViewDuration.split(':').map(Number);
            let seconds = 0;
            if (parts.length === 3) seconds = parts[0] * 3600 + parts[1] * 60 + parts[2];
            else if (parts.length === 2) seconds = parts[0] * 60 + parts[1];
            return sum + seconds;
        }, 0);
        const avgDurationSeconds = Math.round(totalDurationSeconds / sources.length);

        const formatDuration = (seconds: number) => {
            const h = Math.floor(seconds / 3600);
            const m = Math.floor((seconds % 3600) / 60);
            const s = seconds % 60;
            return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
        };

        return {
            sourceType: 'Average',
            sourceTitle: 'Group Average',
            videoId: null,
            impressions: Math.round(totalImpressions / sources.length), // Average impressions per video? Or total?
            // "In each group, first the Average is displayed... (mean by Impressions, CTR...)"
            // Usually "Average" means average per item.
            ctr: parseFloat(avgCtr.toFixed(2)),
            views: Math.round(totalViews / sources.length),
            avgViewDuration: formatDuration(avgDurationSeconds),
            watchTimeHours: totalWatchTime / sources.length
        };
    };

    return (
        <div className="space-y-8 mt-8">
            {groups.map(group => {
                const groupSources = trafficData.filter(s => s.videoId && group.videoIds.includes(s.videoId));
                const averageRow = calculateAverage(groupSources);

                // Check if any selected videos belong to this group
                const selectedInGroup = groupSources
                    .filter(s => s.videoId && selectedIds.has(s.videoId))
                    .map(s => s.videoId as string);

                return (
                    <div key={group.id} className="space-y-3">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div
                                    className="w-4 h-4 rounded-full"
                                    style={{ backgroundColor: group.color }}
                                />
                                <h3 className="text-lg font-medium text-white">
                                    {group.name}
                                    <span className="ml-2 text-sm text-text-secondary font-normal">
                                        ({groupSources.length} videos)
                                    </span>
                                </h3>
                            </div>
                            <div className="flex items-center gap-2">
                                {selectedInGroup.length > 0 && (
                                    <button
                                        onClick={() => onRemoveFromGroup(group.id, selectedInGroup)}
                                        className="px-2 py-1 text-xs font-medium text-red-400 hover:bg-red-400/10 rounded transition-colors mr-2"
                                    >
                                        Remove Selected ({selectedInGroup.length})
                                    </button>
                                )}
                                <button
                                    onClick={() => onEditGroup(group)}
                                    className="p-1.5 text-text-secondary hover:text-white hover:bg-white/10 rounded transition-colors"
                                >
                                    <Edit2 size={16} />
                                </button>
                                <button
                                    onClick={() => onDeleteGroup(group.id)}
                                    className="p-1.5 text-text-secondary hover:text-red-400 hover:bg-red-400/10 rounded transition-colors"
                                >
                                    <Trash2 size={16} />
                                </button>
                            </div>
                        </div>

                        <TrafficTable
                            data={groupSources}
                            totalRow={averageRow} // Using totalRow prop to display Average
                            selectedIds={selectedIds}
                            onToggleSelection={onToggleSelection}
                            onToggleAll={onToggleAll}
                            className="border-l-4"
                        // style={{ borderLeftColor: group.color }} // Can't pass style to className easily without tailwind arbitrary value or style prop
                        />
                        {/* We can add a style prop to TrafficTable or wrap it */}
                    </div>
                );
            })}
        </div>
    );
};
