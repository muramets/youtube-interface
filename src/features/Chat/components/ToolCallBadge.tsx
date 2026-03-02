// =============================================================================
// ToolCallBadge — inline pill showing tool call status in AI responses
// States: pending (shimmer), resolved (green check), error (red alert)
// Expand with JSON details only in dev mode
// =============================================================================

import React, { useState } from 'react';
import { Loader2, Check, AlertCircle, ChevronDown } from 'lucide-react';
import type { ToolCallRecord } from '../../../core/types/chat';

/** Human-readable labels for tool names */
const TOOL_LABELS: Record<string, { pending: string; resolved: string }> = {
    mentionVideo: { pending: 'Looking up video...', resolved: 'Video found' },
    getMultipleVideoDetails: { pending: 'Fetching video details...', resolved: 'Details loaded' },
};

function getToolLabel(name: string, resolved: boolean): string {
    const labels = TOOL_LABELS[name];
    if (!labels) return resolved ? name : `Running ${name}...`;
    return resolved ? labels.resolved : labels.pending;
}

/** Extract a short title from tool result for display */
function getResultTitle(record: ToolCallRecord): string | null {
    if (!record.result) return null;
    const r = record.result as Record<string, unknown>;
    if (typeof r.title === 'string') return r.title;
    if (typeof r.videoTitle === 'string') return r.videoTitle;
    return null;
}

interface ToolCallBadgeProps {
    record: ToolCallRecord;
}

export const ToolCallBadge: React.FC<ToolCallBadgeProps> = ({ record }) => {
    const [expanded, setExpanded] = useState(false);

    const isResolved = record.result !== undefined;
    const isError = isResolved && record.result?.error != null;

    const title = getResultTitle(record);
    const label = isError
        ? String(record.result?.error)
        : title
            ? `${getToolLabel(record.name, true)}: "${title}"`
            : getToolLabel(record.name, isResolved);

    // Color scheme based on state
    const stateClasses = isError
        ? 'bg-red-500/[0.06] text-red-400'
        : isResolved
            ? 'bg-emerald-500/[0.06] text-emerald-400'
            : 'bg-blue-400/[0.06] text-blue-400';

    const isDev = import.meta.env.DEV;

    return (
        <div className="inline-flex flex-col max-w-full">
            <button
                type="button"
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] leading-tight transition-colors duration-200 ${stateClasses} ${isDev ? 'cursor-pointer hover:brightness-125' : 'cursor-default'} ${!isResolved ? 'animate-stream-pulse' : ''}`}
                onClick={() => isDev && setExpanded(v => !v)}
                disabled={!isDev}
            >
                {/* Status icon */}
                {isError ? (
                    <AlertCircle size={12} className="shrink-0" />
                ) : isResolved ? (
                    <Check size={12} className="shrink-0" />
                ) : (
                    <Loader2 size={12} className="shrink-0 animate-spin" />
                )}

                {/* Label */}
                <span className="truncate">{label}</span>

                {/* Expand chevron (dev only) */}
                {isDev && isResolved && (
                    <ChevronDown
                        size={10}
                        className={`shrink-0 opacity-50 transition-transform duration-150 ${expanded ? 'rotate-180' : ''}`}
                    />
                )}
            </button>

            {/* Expandable details (dev mode only) */}
            {isDev && expanded && isResolved && (
                <div className="mt-1 ml-2 p-2 rounded-md bg-white/[0.03] border border-white/[0.06] text-[10px] text-text-tertiary font-mono leading-relaxed overflow-x-auto max-w-full">
                    <div className="mb-1 text-text-secondary font-sans text-[10px] opacity-70">
                        {record.name}({JSON.stringify(record.args)})
                    </div>
                    <pre className="whitespace-pre-wrap break-all m-0">
                        {JSON.stringify(record.result, null, 2)}
                    </pre>
                </div>
            )}
        </div>
    );
};
