import React from 'react';
import { Zap } from 'lucide-react';
import { PortalTooltip } from '../../../components/ui/atoms/PortalTooltip';
import { fmtTokens } from '../utils/tokenDisplay';

interface ChatHeaderStatsProps {
    contextUsed: number;
    contextPercent: number;
    contextLimit: number;
    modelContextLimit: number;
    totalCost: number;
    totalSavings: number;
    totalTokens: number;
    onToggleBreakdown?: () => void;
}

export const ChatHeaderStats: React.FC<ChatHeaderStatsProps> = ({
    contextUsed,
    contextPercent,
    contextLimit,
    modelContextLimit,
    totalCost,
    totalSavings,
    totalTokens,
    onToggleBreakdown,
}) => {
    const hasSavings = totalSavings > 0.01;

    const contextLine = `Auto-summary at ${fmtTokens(contextLimit)}. Model limit: ${fmtTokens(modelContextLimit)}.`;
    const costTooltip = hasSavings
        ? `${contextLine}\nTotal tokens: ${totalTokens.toLocaleString()}\nConversation cost: $${totalCost.toFixed(2)}\nWithout caching: $${(totalCost + totalSavings).toFixed(2)}\nSaved: $${totalSavings.toFixed(2)} (${Math.round((totalSavings / (totalCost + totalSavings)) * 100)}%)`
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
                {totalCost > 0 && (
                    <span className="inline-flex items-center"> · ${totalCost.toFixed(4)}</span>
                )}
                {hasSavings && (
                    <span className="inline-flex items-center" style={{ color: 'var(--color-success)' }}> · saved ${totalSavings.toFixed(2)}</span>
                )}
            </span>
        </PortalTooltip>
    );
};
