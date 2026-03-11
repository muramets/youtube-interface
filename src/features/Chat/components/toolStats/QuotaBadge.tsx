import React from 'react';
import { Satellite } from 'lucide-react';

/** Quota badge — shows API cost when a tool used YouTube quota. */
export const QuotaBadge: React.FC<{ quota: number }> = ({ quota }) => {
    if (quota <= 0) return null;
    return (
        <span className="inline-flex items-center gap-0.5 ml-1 text-[9px] text-text-tertiary opacity-70">
            <Satellite size={9} className="shrink-0" />
            {quota}
        </span>
    );
};
