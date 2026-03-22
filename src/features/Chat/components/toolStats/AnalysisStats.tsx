import React from 'react';
import { BarChart3, TrendingUp } from 'lucide-react';
import { PortalTooltip } from '../../../../components/ui/atoms/PortalTooltip';

/** Compact stats for analyzeSuggestedTraffic expanded view. */
export const AnalysisStats: React.FC<{ result: Record<string, unknown> }> = ({ result }) => {
    const timeline = result.snapshotTimeline as Array<{ date: string; label?: string; totalSources: number }> | undefined;
    const topSources = result.topSources as unknown[] | undefined;
    const tail = result.tail as { count: number } | undefined;
    const transitions = result.transitions as Array<{
        periodFromDate: string;
        periodToDate: string;
        newCount: number;
        droppedCount: number;
    }> | undefined;

    const snapshotCount = timeline?.length ?? 0;
    const totalSources = (topSources?.length ?? 0) + (tail?.count ?? 0);
    const topCount = topSources?.length ?? 0;

    // Derive depth label from topCount
    const depthLabel = topCount >= totalSources
        ? 'Full analysis'
        : topCount >= 100
            ? 'Detailed analysis'
            : topCount >= 50
                ? 'Standard analysis'
                : 'Quick analysis';

    // Build tooltip content for transitions timeline
    const tooltipContent = timeline && timeline.length > 0 ? (
        <div className="flex flex-col gap-1 text-[11px] text-text-secondary min-w-[200px]">
            <span className="text-[10px] text-text-tertiary font-medium mb-0.5">Timeline:</span>
            {timeline.map((snap, i) => {
                const transition = transitions && i > 0 ? transitions[i - 1] : null;
                return (
                    <div key={snap.date} className="flex items-baseline gap-1.5">
                        <span className="text-text-primary">
                            {snap.date}{snap.label ? ` (${snap.label})` : ''}:
                        </span>
                        <span>{snap.totalSources} sources</span>
                        {transition && (transition.newCount > 0 || transition.droppedCount > 0) && (
                            <span className="text-text-tertiary text-[10px]">
                                ({transition.newCount > 0 ? `+${transition.newCount} new` : ''}
                                {transition.newCount > 0 && transition.droppedCount > 0 ? ', ' : ''}
                                {transition.droppedCount > 0 ? `-${transition.droppedCount} dropped` : ''})
                            </span>
                        )}
                    </div>
                );
            })}
        </div>
    ) : null;

    const statsContent = (
        <div className="flex flex-col gap-1.5 px-2 py-1.5 rounded-md bg-surface-primary dark:bg-white/[0.03] text-[11px] text-text-secondary">
            <span className="inline-flex items-center gap-1.5">
                <BarChart3 size={11} className="shrink-0 opacity-60" />
                {snapshotCount} {snapshotCount === 1 ? 'snapshot' : 'snapshots'}
            </span>
            <span className="inline-flex items-center gap-1.5">
                <TrendingUp size={11} className="shrink-0 opacity-60" />
                {totalSources} active sources ({depthLabel.toLowerCase()}: top {topCount})
            </span>
        </div>
    );

    if (tooltipContent) {
        return (
            <PortalTooltip
                content={tooltipContent}
                side="top"
                align="left"
                maxWidth={320}
                enterDelay={200}
                triggerClassName="!justify-start w-full"
            >
                {statsContent}
            </PortalTooltip>
        );
    }

    return statsContent;
};
