import React, { useRef } from 'react';
import { Info, AlertTriangle } from 'lucide-react';
import { PortalTooltip } from '../../../../../components/Shared/PortalTooltip';
import type { MetricDelta } from '../hooks/useTrafficDataLoader';

interface SmartTrafficTooltipProps {
    actualTotal: number;
    tableSum: number;
    trashValue?: number;
    deltaContext?: MetricDelta; // Generic metric delta (impressions OR views)
    isIncomplete?: boolean; // Signal strictly for missing total row
    forceOpen?: boolean;
    onMouseEnter?: () => void;
    onMouseLeave?: () => void;
}

export const SmartTrafficTooltip: React.FC<SmartTrafficTooltipProps> = ({
    actualTotal,
    tableSum,
    trashValue = 0,
    deltaContext,
    isIncomplete,
    forceOpen,
    onMouseEnter,
    onMouseLeave
}) => {
    const enterTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const wrapperRef = useRef<HTMLDivElement>(null);

    let content: React.ReactNode;
    let isSignificantRef = false;

    // -------------------------------------------------------------------------
    // RENDER MODE 1: DELTA GROWTH ANALYSIS
    // -------------------------------------------------------------------------
    if (isIncomplete) {
        // ERROR STATE: Total Row Missing
        content = (
            <div
                className="flex flex-col gap-2 p-1 max-w-[320px]"
                onMouseEnter={onMouseEnter}
                onMouseLeave={onMouseLeave}
            >
                <div className="flex items-center gap-2 font-medium text-sm border-b pb-2 mb-1 border-white/10 text-red-400">
                    <AlertTriangle className="w-4 h-4" />
                    <span>Comparison Unavailable</span>
                </div>
                <div className="text-[13px] text-white/80 leading-relaxed">
                    <p>
                        The "Total" column was not found in the uploaded CSV for the previous snapshot.
                    </p>
                    <p className="mt-2 text-white/60 text-[11px] italic">
                        Without an explicit total row, the application cannot calculate the true traffic growth vs. new table entries.
                    </p>
                </div>
            </div>
        );
        isSignificantRef = true; // Use warning icon
    } else if (deltaContext) {
        // NORMAL STATE: Growth Analysis
        const { previous = 0, current = 0, delta = 0 } = deltaContext;

        // tableSum = Visible Table Growth (Top Videos) - ALREADY excludes Trash (filtered out)
        // trashValue = Trash Growth (passed explicitly)
        const trashChange = trashValue;
        const nonTrashTableGrowth = tableSum;

        // Unaccounted = Total Report Delta - (Visible Table Growth + Trash Growth)
        const unaccountedGrowth = Math.max(0, delta - (nonTrashTableGrowth + trashChange));

        const isSignificantGrowth = delta > 0 && unaccountedGrowth > (delta * 0.1);
        isSignificantRef = isSignificantGrowth;

        content = (
            <div
                className="flex flex-col gap-2 p-1 max-w-[320px]"
                onMouseEnter={() => {
                    if (enterTimeoutRef.current) clearTimeout(enterTimeoutRef.current);
                    if (onMouseEnter) onMouseEnter();
                }}
                onMouseLeave={(e: any) => {
                    // Ref Bridge containment check
                    if (wrapperRef.current && wrapperRef.current.contains(e.relatedTarget as Node)) {
                        return;
                    }
                    if (onMouseLeave) onMouseLeave();
                }}
            >
                <div className="flex items-center gap-2 font-medium text-sm border-b pb-2 mb-1 border-white/10">
                    <Info className="w-4 h-4 text-blue-400" />
                    <span>Traffic Growth Analysis</span>
                </div>

                <div className="space-y-2 text-[13px] leading-relaxed">
                    {/* Total Change */}
                    <div className="flex justify-between text-white/90">
                        <div className="flex flex-col">
                            <span>Total Change (Report):</span>
                            <span className="text-[10px] text-white/40 font-mono">
                                {previous.toLocaleString()} → {current.toLocaleString()}
                            </span>
                        </div>
                        <span className="text-white font-mono font-bold">
                            +{delta.toLocaleString()}
                        </span>
                    </div>

                    <div className="h-px bg-white/5 my-1" />

                    {/* Breakdown */}
                    <div className="space-y-1">
                        <div className="flex justify-between text-white/60 text-[12px]">
                            <span>Top Videos Growth:</span>
                            <span className="font-mono">+{nonTrashTableGrowth.toLocaleString()}</span>
                        </div>
                        {trashChange > 0 && (
                            <div className="flex justify-between text-white/60 text-[12px]">
                                <span>Trash Traffic Variation:</span>
                                <span>+{trashChange.toLocaleString()}</span>
                            </div>
                        )}
                    </div>

                    <div className="flex justify-between pt-1 border-t border-white/5 font-medium">
                        <span className="text-white/80"><strong>Unaccounted</strong> Growth:</span>
                        <span className={`font-mono ${isSignificantGrowth ? 'text-amber-300' : 'text-white/60'}`}>
                            +{unaccountedGrowth.toLocaleString()}
                        </span>
                    </div>
                </div>

                <div className="text-[11px] text-white/40 italic mt-2 leading-relaxed flex flex-col gap-2.5 [hyphens:none] [word-break:normal]">
                    <p>
                        This breakdown shows actual growth between reports compared to the new videos appearing in your table.
                    </p>
                </div>
            </div>
        );
    } else {
        // -------------------------------------------------------------------------
        // RENDER MODE 2: CUMULATIVE DISCREPANCY (All Time)
        // -------------------------------------------------------------------------
        // tableSum = Visible Top Videos (Trash is filtered out)
        // actualTotal = Report Total
        // Long Tail = Report Total - (Visible + Trash)
        const nonTrashTable = tableSum;
        const longTail = Math.max(0, actualTotal - (nonTrashTable + trashValue));

        const isSignificant = longTail > actualTotal * 0.05;
        isSignificantRef = isSignificant;

        content = (
            <div
                className="flex flex-col gap-2 p-1 max-w-[320px]"
                onMouseEnter={() => {
                    if (enterTimeoutRef.current) clearTimeout(enterTimeoutRef.current);
                    if (onMouseEnter) onMouseEnter();
                }}
                onMouseLeave={(e: any) => {
                    // Ref Bridge containment check
                    if (wrapperRef.current && wrapperRef.current.contains(e.relatedTarget as Node)) {
                        return;
                    }
                    if (onMouseLeave) onMouseLeave();
                }}
            >
                <div className="flex items-center gap-2 font-medium text-sm border-b pb-2 mb-1 border-white/10">
                    {isSignificant ? (
                        <AlertTriangle className="w-4 h-4 text-amber-400" />
                    ) : (
                        <Info className="w-4 h-4 text-blue-400" />
                    )}
                    <span>Traffic Discrepancy Explained</span>
                </div>

                <div className="space-y-1.5 text-[13px] leading-relaxed">
                    <div className="flex justify-between text-white/60 gap-4">
                        <span>Actual Total (from report):</span>
                        <span className="text-white font-mono">{actualTotal.toLocaleString()}</span>
                    </div>

                    <div className="space-y-1">
                        <div className="flex justify-between text-white/60 text-[12px]">
                            <span>Top Videos Sum:</span>
                            <span className="text-white/80 font-mono">{nonTrashTable.toLocaleString()}</span>
                        </div>
                        {trashValue > 0 && (
                            <div className="flex justify-between text-white/60 text-[12px]">
                                <span>Trash Content:</span>
                                <span className="text-white/80 font-mono">{trashValue.toLocaleString()}</span>
                            </div>
                        )}
                    </div>

                    <div className="flex justify-between pt-1 border-t border-white/5 font-medium">
                        <span className="text-white/80"><strong>Long Tail</strong> Difference:</span>
                        <span className="text-amber-300 font-mono">+{longTail.toLocaleString()}</span>
                    </div>
                </div>

                <div className="text-[11px] text-white/40 italic mt-2 leading-relaxed flex flex-col gap-2.5 [hyphens:none] [word-break:normal]">
                    <p>
                        The list below displays your top performing sources. The difference in numbers represents the 'Long Tail' — aggregated data from minor sources and privacy-protected views that are hidden to keep your report clean.
                    </p>
                    <p>
                        A large discrepancy often signals that the algorithm is still in the <strong>exploration phase</strong> — testing your content across random topics because it hasn't locked onto a specific target audience yet.
                    </p>
                </div>
            </div>
        );
    }

    return (
        <PortalTooltip
            content={content}
            side="top"
            align="center"
            forceOpen={forceOpen}
            enterDelay={0}
        >
            <div
                ref={wrapperRef}
                className={`cursor-default inline-flex items-center justify-center mr-1 opacity-50 hover:opacity-100 transition-all duration-200 -m-2 p-2 ${isIncomplete ? 'text-red-400 opacity-100' : ''}`}
                onMouseEnter={() => {
                    if (enterTimeoutRef.current) clearTimeout(enterTimeoutRef.current);

                    enterTimeoutRef.current = setTimeout(() => {
                        onMouseEnter?.();
                    }, 500);
                }}
                onMouseLeave={() => {
                    if (enterTimeoutRef.current) {
                        clearTimeout(enterTimeoutRef.current);
                        enterTimeoutRef.current = null;
                    }
                    onMouseLeave?.();
                }}
            >
                {isSignificantRef ? (
                    <AlertTriangle className={`w-3.5 h-3.5 ${isIncomplete ? 'text-red-400' : 'text-amber-400/90'}`} />
                ) : (
                    <Info className="w-3.5 h-3.5 text-blue-400/90" />
                )}
            </div>
        </PortalTooltip>
    );
};
