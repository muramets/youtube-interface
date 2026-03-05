import React from 'react';
import { Zap } from 'lucide-react';
import { PortalTooltip } from '../../../components/ui/atoms/PortalTooltip';

interface ChatHeaderStatsProps {
    contextUsed: number;
    contextPercent: number;
    totalCostEur: number;
    totalSavingsEur: number;
    totalTokens: number;
}

export const ChatHeaderStats: React.FC<ChatHeaderStatsProps> = ({
    contextUsed,
    contextPercent,
    totalCostEur,
    totalSavingsEur,
    totalTokens,
}) => {
    const hasSavings = totalSavingsEur > 0.01;
    const costTooltip = hasSavings
        ? `Total tokens: ${totalTokens.toLocaleString()}\nConversation cost: €${totalCostEur.toFixed(2)}\nWithout caching: €${(totalCostEur + totalSavingsEur).toFixed(2)}\nSaved: €${totalSavingsEur.toFixed(2)} (${Math.round((totalSavingsEur / (totalCostEur + totalSavingsEur)) * 100)}%)`
        : `Total tokens: ${totalTokens.toLocaleString()}`;

    if (contextUsed <= 0) return null;

    return (
        <span className="text-[11px] text-text-tertiary whitespace-nowrap shrink-0 select-none cursor-default inline-flex items-center gap-0.5 hover:text-text-secondary transition-colors">
            <Zap size={11} /> {contextUsed.toLocaleString()} ({contextPercent}%)
            {totalCostEur > 0 && (
                <PortalTooltip content={costTooltip} enterDelay={300}>
                    <span className="inline-flex items-center"> · €{totalCostEur.toFixed(4)}</span>
                </PortalTooltip>
            )}
            {hasSavings && (
                <span className="inline-flex items-center" style={{ color: 'var(--color-success)' }}> · saved €{totalSavingsEur.toFixed(2)}</span>
            )}
        </span>
    );
};
