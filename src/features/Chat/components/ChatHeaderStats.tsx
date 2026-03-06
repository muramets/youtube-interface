import React from 'react';
import { Zap } from 'lucide-react';
import { PortalTooltip } from '../../../components/ui/atoms/PortalTooltip';

/** Format a token count as a compact string, e.g. 120_000 → "120K", 1_000_000 → "1M". */
function formatTokenCount(n: number): string {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M`;
    if (n >= 1_000) return `${Math.round(n / 1_000)}K`;
    return n.toLocaleString();
}

interface ChatHeaderStatsProps {
    contextUsed: number;
    contextPercent: number;
    contextLimit: number;
    modelContextLimit: number;
    totalCostEur: number;
    totalSavingsEur: number;
    totalTokens: number;
    onToggleBreakdown?: () => void;
}

export const ChatHeaderStats: React.FC<ChatHeaderStatsProps> = ({
    contextUsed,
    contextPercent,
    contextLimit,
    modelContextLimit,
    totalCostEur,
    totalSavingsEur,
    totalTokens,
    onToggleBreakdown,
}) => {
    const hasSavings = totalSavingsEur > 0.01;

    const contextLine = `Auto-summary at ${formatTokenCount(contextLimit)}. Model limit: ${formatTokenCount(modelContextLimit)}.`;
    const costTooltip = hasSavings
        ? `${contextLine}\nTotal tokens: ${totalTokens.toLocaleString()}\nConversation cost: €${totalCostEur.toFixed(2)}\nWithout caching: €${(totalCostEur + totalSavingsEur).toFixed(2)}\nSaved: €${totalSavingsEur.toFixed(2)} (${Math.round((totalSavingsEur / (totalCostEur + totalSavingsEur)) * 100)}%)`
        : `${contextLine}\nTotal tokens: ${totalTokens.toLocaleString()}\nClick for breakdown`;

    if (contextUsed <= 0) return null;

    return (
        <PortalTooltip content={costTooltip} enterDelay={300}>
            <span
                className="text-[11px] text-text-tertiary whitespace-nowrap shrink-0 select-none inline-flex items-center gap-0.5 hover:text-text-secondary transition-colors cursor-pointer"
                onClick={onToggleBreakdown}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                    if ((e.key === 'Enter' || e.key === ' ') && onToggleBreakdown) {
                        e.preventDefault();
                        onToggleBreakdown();
                    }
                }}
            >
                <Zap size={11} /> {contextUsed.toLocaleString()} ({contextPercent}%)
                {totalCostEur > 0 && (
                    <span className="inline-flex items-center"> · €{totalCostEur.toFixed(4)}</span>
                )}
                {hasSavings && (
                    <span className="inline-flex items-center" style={{ color: 'var(--color-success)' }}> · saved €{totalSavingsEur.toFixed(2)}</span>
                )}
            </span>
        </PortalTooltip>
    );
};
