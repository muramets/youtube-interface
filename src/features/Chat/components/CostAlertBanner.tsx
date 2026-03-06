// =============================================================================
// CostAlertBanner — warning banner for high conversation costs.
// Dismissible per-session (not persisted).
// =============================================================================

import React, { useState } from 'react';
import { X, AlertTriangle } from 'lucide-react';
import type { AlertLevel } from '../hooks/useCostAlerts';

const LEVEL_STYLES: Record<Exclude<AlertLevel, 'none'>, { bg: string; border: string; text: string }> = {
    low: {
        bg: 'bg-amber-500/10',
        border: 'border-amber-500/30',
        text: 'text-amber-600 dark:text-amber-400',
    },
    medium: {
        bg: 'bg-orange-500/10',
        border: 'border-orange-500/30',
        text: 'text-orange-600 dark:text-orange-400',
    },
    high: {
        bg: 'bg-red-500/10',
        border: 'border-red-500/30',
        text: 'text-red-600 dark:text-red-400',
    },
};

interface CostAlertBannerProps {
    level: Exclude<AlertLevel, 'none'>;
    totalCostUsd: number;
    recommendation: string | null;
}

export const CostAlertBanner: React.FC<CostAlertBannerProps> = ({
    level,
    totalCostUsd,
    recommendation,
}) => {
    const [dismissed, setDismissed] = useState(false);

    if (dismissed) return null;

    const styles = LEVEL_STYLES[level];
    const label = level === 'high'
        ? `High cost conversation: $${totalCostUsd.toFixed(2)}`
        : `This conversation has cost $${totalCostUsd.toFixed(2)}`;

    return (
        <div role="alert" className={`flex items-start gap-2 px-3.5 py-2 border-b ${styles.border} ${styles.bg}`}>
            <AlertTriangle size={14} className={`shrink-0 mt-0.5 ${styles.text}`} />
            <div className="flex-1 min-w-0">
                <div className={`text-[11px] font-medium ${styles.text}`}>
                    {label}
                </div>
                {recommendation && (
                    <div className="text-[10px] text-text-tertiary mt-0.5">
                        {recommendation}
                    </div>
                )}
            </div>
            <button
                onClick={() => setDismissed(true)}
                className="shrink-0 p-0.5 rounded hover:bg-black/10 dark:hover:bg-white/10 transition-colors"
                aria-label="Dismiss cost alert"
            >
                <X size={12} className="text-text-tertiary" />
            </button>
        </div>
    );
};
