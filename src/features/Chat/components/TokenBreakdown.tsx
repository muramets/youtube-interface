// =============================================================================
// TokenBreakdown — expandable panel showing per-component token budget bars.
// Reads contextBreakdown from the last model message + billing from normalizedUsage.
// =============================================================================

import React, { useMemo } from 'react';
import type { ContextBreakdown } from '../../../../shared/models';
import type { NormalizedTokenUsage } from '../../../../shared/models';
import { scaleBreakdown, fmtTokens, type ScaledBreakdown } from '../utils/tokenDisplay';

/** Component label + color mapping — two variants depending on layer data availability. */
/** Only numeric keys — excludes `hasSystemLayers` boolean flag. */
type ScaledNumericKey = Exclude<keyof ScaledBreakdown, 'hasSystemLayers'>;

const COMPONENTS_FLAT: { key: ScaledNumericKey; label: string; color: string }[] = [
    { key: 'systemPrompt', label: 'System prompt', color: 'bg-blue-500' },
    { key: 'toolDefinitions', label: 'Tool definitions', color: 'bg-indigo-500' },
    { key: 'history', label: 'History', color: 'bg-purple-500' },
    { key: 'historyToolResults', label: 'History tools', color: 'bg-purple-400' },
    { key: 'images', label: 'Images', color: 'bg-pink-500' },
    { key: 'memory', label: 'Memory / Summary', color: 'bg-amber-500' },
    { key: 'currentMessage', label: 'Current message', color: 'bg-emerald-500' },
    { key: 'toolResults', label: 'Tool results', color: 'bg-cyan-500' },
];

const COMPONENTS_LAYERED: { key: ScaledNumericKey; label: string; color: string }[] = [
    { key: 'systemSettings', label: 'Settings', color: 'bg-blue-500' },
    { key: 'persistentContext', label: 'Attached context', color: 'bg-blue-400' },
    { key: 'crossMemory', label: 'Memories', color: 'bg-blue-300' },
    { key: 'toolDefinitions', label: 'Tool definitions', color: 'bg-indigo-500' },
    { key: 'history', label: 'History', color: 'bg-purple-500' },
    { key: 'historyToolResults', label: 'History tools', color: 'bg-purple-400' },
    { key: 'images', label: 'Images', color: 'bg-pink-500' },
    { key: 'memory', label: 'Memory / Summary', color: 'bg-amber-500' },
    { key: 'currentMessage', label: 'Current message', color: 'bg-emerald-500' },
    { key: 'toolResults', label: 'Tool results', color: 'bg-cyan-500' },
];

interface TokenBreakdownProps {
    contextBreakdown: ContextBreakdown;
    contextUsed: number;
    contextLimit: number;
    normalizedUsage?: NormalizedTokenUsage;
}

export const TokenBreakdown: React.FC<TokenBreakdownProps> = ({
    contextBreakdown,
    contextUsed,
    contextLimit,
    normalizedUsage,
}) => {
    const scaled = useMemo(
        () => scaleBreakdown(contextBreakdown, contextUsed),
        [contextBreakdown, contextUsed],
    );

    const total = contextUsed;
    const pctOfLimit = contextLimit > 0 ? Math.round((total / contextLimit) * 100) : 0;

    // Choose flat or layered component list based on data availability
    const components = scaled.hasSystemLayers ? COMPONENTS_LAYERED : COMPONENTS_FLAT;

    // Filter to non-zero components
    const visibleComponents = useMemo(
        () => components.filter(c => scaled[c.key] > 0),
        [scaled, components],
    );

    const billingCost = normalizedUsage?.billing?.cost?.total;

    return (
        <div className="space-y-3" role="region" aria-label="Token breakdown">
            {/* === Context Breakdown === */}
            <div>
                <div className="text-[11px] font-medium text-text-secondary mb-1.5">
                    Context Breakdown (last request)
                </div>

                {/* Stacked bar */}
                <div className="flex h-2.5 rounded-full overflow-hidden bg-surface-secondary mb-2" aria-label="Context breakdown chart">
                    {visibleComponents.map(c => {
                        const pct = total > 0 ? (scaled[c.key] / total) * 100 : 0;
                        if (pct < 0.5) return null;
                        return (
                            <div
                                key={c.key}
                                className={`${c.color} opacity-80 hover:opacity-100 transition-opacity`}
                                style={{ width: `${pct}%` }}
                                role="img"
                                aria-label={`${c.label}: ${fmtTokens(scaled[c.key])} (${Math.round(pct)}%)`}
                            />
                        );
                    })}
                </div>

                {/* Legend list */}
                <div className="space-y-0.5" role="list" aria-label="Context components">
                    {visibleComponents.map(c => {
                        const tokens = scaled[c.key];
                        const pct = total > 0 ? Math.round((tokens / total) * 100) : 0;
                        const barWidth = total > 0 ? Math.max(2, Math.round((tokens / total) * 100)) : 0;
                        return (
                            <div key={c.key} role="listitem" className="flex items-center gap-2 text-[10px]">
                                <div className={`w-2 h-2 rounded-sm shrink-0 ${c.color} opacity-80`} />
                                <span className="text-text-secondary w-28 shrink-0">{c.label}</span>
                                <div className="flex-1 h-1.5 rounded-full bg-surface-secondary overflow-hidden">
                                    <div className={`h-full ${c.color} opacity-60`} style={{ width: `${barWidth}%` }} />
                                </div>
                                <span className="text-text-tertiary w-16 text-right shrink-0">{fmtTokens(tokens)}</span>
                                <span className="text-text-tertiary w-8 text-right shrink-0">{pct}%</span>
                            </div>
                        );
                    })}
                </div>

                {/* Total line */}
                <div className="mt-1.5 pt-1.5 border-t border-border text-[10px] text-text-secondary">
                    Total: {fmtTokens(total)} / {fmtTokens(contextLimit)} ({pctOfLimit}% to auto-summary)
                </div>
            </div>

            {/* === Billing (if available) === */}
            {billingCost != null && (
                <div>
                    <div className="text-[11px] font-medium text-text-secondary mb-1">
                        Billing
                    </div>
                    <div className="space-y-0.5 text-[10px] text-text-secondary">
                        {billingCost != null && (
                            <div className="flex justify-between">
                                <span>Last request</span>
                                <span>${billingCost.toFixed(4)}</span>
                            </div>
                        )}
                        {normalizedUsage?.billing?.cost?.withoutCache != null &&
                         normalizedUsage.billing.cost.withoutCache > (billingCost ?? 0) + 0.0001 && (
                            <div className="flex justify-between text-text-tertiary">
                                <span>Without cache</span>
                                <span>${normalizedUsage.billing.cost.withoutCache.toFixed(4)}</span>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* === Thinking tokens (if present) === */}
            {normalizedUsage?.billing?.output?.thinking != null &&
             normalizedUsage.billing.output.thinking > 0 && (
                <div className="text-[10px] text-text-secondary flex justify-between">
                    <span>Thinking tokens</span>
                    <span>
                        {fmtTokens(normalizedUsage.billing.output.thinking)}
                        {normalizedUsage.billing?.cost?.thinkingSubset != null &&
                         normalizedUsage.billing.cost.thinkingSubset > 0 && (
                            <span className="text-text-tertiary ml-1">
                                (${normalizedUsage.billing.cost.thinkingSubset.toFixed(4)})
                            </span>
                        )}
                    </span>
                </div>
            )}

            {/* === Meta info === */}
            {contextBreakdown.usedSummary && (
                <div className="text-[10px] text-text-tertiary italic">
                    Context includes summarized history
                </div>
            )}
        </div>
    );
};
