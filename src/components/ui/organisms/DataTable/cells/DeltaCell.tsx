import { memo } from 'react';

// =============================================================================
// DeltaCell — Unified delta value display
//
// Shows absolute change as primary text, percentage + original as secondary.
// Premium: dual-speed color transitions (350ms fade-out, 75ms snap-in on hover).
// Unified from TrafficSourceTable's DeltaCell and TrendsTable's DeltaValue.
// =============================================================================

interface DeltaCellProps {
    /** Absolute delta value (e.g. +150, -23) */
    delta: number | undefined | null;
    /** Percentage change (e.g. 12.5 for +12.5%) */
    pct?: number | undefined;
    /** Suffix after the value (e.g. '%', 'h') */
    suffix?: string;
    /** Original (pre-delta) value string (e.g. '1,234') */
    original?: string;
    /** Compact mode — single line, no secondary info (like TrendsTable's DeltaValue) */
    compact?: boolean;
}

export const DeltaCell = memo<DeltaCellProps>(({
    delta,
    pct,
    suffix = '',
    original,
    compact = false,
}) => {
    const isEmpty = delta === undefined || delta === null || delta === 0;
    const isPositive = !isEmpty && delta > 0;
    const sign = isPositive ? '+' : '';

    // Format primary value
    const primaryStr = isEmpty
        ? '–'
        : (() => {
            const absStr = Number.isInteger(delta)
                ? Math.abs(delta).toLocaleString()
                : Math.abs(delta).toFixed(2);
            return `${sign}${isPositive ? absStr : `-${absStr}`}${suffix}`;
        })();

    // Compact mode — single value, no secondary line
    if (compact) {
        if (isEmpty) return <span className="text-text-tertiary">-</span>;
        return (
            <span
                className={`font-mono transition-colors duration-[350ms] group-hover:duration-75 ${
                    isPositive
                        ? 'text-emerald-500/60 group-hover:text-emerald-400'
                        : 'text-red-500/60 group-hover:text-red-400'
                }`}
            >
                {primaryStr}
            </span>
        );
    }

    // Full mode — two-line layout: primary value + secondary (pct + original)
    return (
        <div
            className={`flex flex-col items-end transition-colors duration-[350ms] group-hover:duration-75 ${
                !isEmpty
                    ? isPositive
                        ? 'text-emerald-500/60 group-hover:text-emerald-400'
                        : 'text-red-500/60 group-hover:text-red-400'
                    : ''
            }`}
        >
            <span className={`font-medium ${isEmpty ? 'opacity-25' : ''}`}>
                {primaryStr}
            </span>
            {/* Secondary line — keeps row height consistent even when empty */}
            <span className="flex items-center gap-1.5 text-[10px]">
                <span className={pct !== undefined && !isEmpty ? 'opacity-70' : 'invisible'}>
                    {pct !== undefined ? `${sign}${pct}%` : '–'}
                </span>
                <span
                    className={
                        original !== undefined && !isEmpty
                            ? 'text-text-primary/30 group-hover:text-text-primary/55 transition-colors duration-[350ms] group-hover:duration-75'
                            : 'invisible'
                    }
                >
                    {original ?? '–'}
                </span>
            </span>
        </div>
    );
});

DeltaCell.displayName = 'DeltaCell';
