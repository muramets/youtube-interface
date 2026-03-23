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
        <div className="text-[11px]">
            <div className="grid grid-cols-[auto_auto_1fr] gap-x-3 gap-y-0.5 items-baseline">
                {/* Header row */}
                <span className="text-[10px] text-text-tertiary font-medium whitespace-nowrap">Snapshot</span>
                <span className="text-[10px] text-text-tertiary font-medium whitespace-nowrap text-right">Sources</span>
                <span className="text-[10px] text-text-tertiary font-medium whitespace-nowrap">Changes</span>

                {/* Separator */}
                <div className="col-span-3 h-px bg-border/50 my-0.5" />

                {/* Data rows */}
                {timeline.map((snap, i) => {
                    const transition = transitions && i > 0 ? transitions[i - 1] : null;
                    return (
                        <React.Fragment key={snap.date}>
                            <span className="text-text-primary whitespace-nowrap">
                                {snap.label ?? snap.date}
                            </span>
                            <span className="text-text-secondary whitespace-nowrap text-right tabular-nums">
                                {snap.totalSources}
                            </span>
                            <span className="whitespace-nowrap text-[10px]">
                                {transition && (transition.newCount > 0 || transition.droppedCount > 0) ? (
                                    <>
                                        {transition.newCount > 0 && (
                                            <span className="text-emerald-400/80">+{transition.newCount}</span>
                                        )}
                                        {transition.newCount > 0 && transition.droppedCount > 0 && (
                                            <span className="text-text-tertiary"> / </span>
                                        )}
                                        {transition.droppedCount > 0 && (
                                            <span className="text-red-400/70">−{transition.droppedCount}</span>
                                        )}
                                    </>
                                ) : (
                                    <span className="text-text-tertiary">—</span>
                                )}
                            </span>
                        </React.Fragment>
                    );
                })}
            </div>

            {/* Footer */}
            <div className="flex items-center gap-1.5 mt-1.5 pt-1.5 border-t border-border/50 text-[10px] text-text-tertiary">
                <BarChart3 size={10} className="shrink-0 opacity-50" />
                {snapshotCount} snapshots
            </div>
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
                maxWidth={480}
                enterDelay={200}
                triggerClassName="!justify-start w-full"
            >
                {statsContent}
            </PortalTooltip>
        );
    }

    return statsContent;
};
