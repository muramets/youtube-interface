// =============================================================================
// TokenBreakdown — expandable panel showing per-component token budget bars.
// Reads contextBreakdown from the last model message + billing from normalizedUsage.
// =============================================================================

import React, { useMemo } from 'react';
import type { ContextBreakdown } from '../../../../shared/models';
import type { NormalizedTokenUsage } from '../../../../shared/models';
import { scaleBreakdown, type ScaledBreakdown } from '../utils/tokenDisplay';
import type { AuxiliaryCost } from '../../../../shared/models';

/** Format token count as compact string: 120000 → "120K". */
function fmtTokens(n: number): string {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
    return n.toLocaleString();
}

/** Component label + color mapping. */
const COMPONENTS: { key: keyof ScaledBreakdown; label: string; color: string }[] = [
    { key: 'systemPrompt', label: 'System prompt', color: 'bg-blue-500' },
    { key: 'toolDefinitions', label: 'Tool definitions', color: 'bg-indigo-500' },
    { key: 'history', label: 'History', color: 'bg-purple-500' },
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
    auxiliaryCosts?: AuxiliaryCost[];
}

export const TokenBreakdown: React.FC<TokenBreakdownProps> = ({
    contextBreakdown,
    contextUsed,
    contextLimit,
    normalizedUsage,
    auxiliaryCosts,
}) => {
    const scaled = useMemo(
        () => scaleBreakdown(contextBreakdown, contextUsed),
        [contextBreakdown, contextUsed],
    );

    const total = contextUsed;
    const pctOfLimit = contextLimit > 0 ? Math.round((total / contextLimit) * 100) : 0;

    // Filter to non-zero components
    const visibleComponents = useMemo(
        () => COMPONENTS.filter(c => scaled[c.key] > 0),
        [scaled],
    );

    const billingCost = normalizedUsage?.billing?.cost?.total;

    const auxTotal = useMemo(
        () => auxiliaryCosts?.reduce((s, c) => s + c.costUsd, 0) ?? 0,
        [auxiliaryCosts],
    );

    return (
        <div className="space-y-3" role="region" aria-label="Token breakdown">
            {/* === Context Breakdown === */}
            <div>
                <div className="text-[11px] font-medium text-text-secondary mb-1.5">
                    Context Breakdown (last request)
                </div>

                {/* Stacked bar */}
                <div className="flex h-2.5 rounded-full overflow-hidden bg-surface-secondary mb-2">
                    {visibleComponents.map(c => {
                        const pct = total > 0 ? (scaled[c.key] / total) * 100 : 0;
                        if (pct < 0.5) return null;
                        return (
                            <div
                                key={c.key}
                                className={`${c.color} opacity-80 hover:opacity-100 transition-opacity`}
                                style={{ width: `${pct}%` }}
                                title={`${c.label}: ${fmtTokens(scaled[c.key])} (${Math.round(pct)}%)`}
                            />
                        );
                    })}
                </div>

                {/* Legend list */}
                <div className="space-y-0.5">
                    {visibleComponents.map(c => {
                        const tokens = scaled[c.key];
                        const pct = total > 0 ? Math.round((tokens / total) * 100) : 0;
                        const barWidth = total > 0 ? Math.max(2, Math.round((tokens / total) * 100)) : 0;
                        return (
                            <div key={c.key} className="flex items-center gap-2 text-[10px]">
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
            {(billingCost != null || auxTotal > 0) && (
                <div>
                    <div className="text-[11px] font-medium text-text-secondary mb-1">
                        Billing
                    </div>
                    <div className="space-y-0.5 text-[10px] text-text-secondary">
                        {billingCost != null && (
                            <div className="flex justify-between">
                                <span>This message</span>
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
                        {auxiliaryCosts && auxiliaryCosts.length > 0 && (
                            <>
                                {auxiliaryCosts.map(ac => (
                                    <div key={ac.id} className="flex justify-between">
                                        <span className="capitalize">{ac.type}</span>
                                        <span>${ac.costUsd.toFixed(4)}</span>
                                    </div>
                                ))}
                            </>
                        )}
                    </div>
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
