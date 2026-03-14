// =============================================================================
// ToolCallBadge — inline pill showing tool call status in AI responses
// States: pending (shimmer), resolved (green check), error (red alert)
// Expand with JSON details only in dev mode
// =============================================================================

import React, { useState } from 'react';
import { Loader2, Check, AlertCircle, ChevronDown } from 'lucide-react';
import type { ToolCallRecord } from '../../../core/types/chat/chat';

/** Human-readable labels for tool names */
const TOOL_LABELS: Record<string, { pending: string; resolved: string }> = {
    mentionVideo: { pending: 'Looking up video...', resolved: 'Video found' },
    getMultipleVideoDetails: { pending: 'Fetching video details...', resolved: 'Details loaded' },
    analyzeSuggestedTraffic: { pending: 'Analyzing suggested traffic...', resolved: 'Suggested traffic analyzed' },
    analyzeTrafficSources: { pending: 'Analyzing traffic sources...', resolved: 'Traffic sources analyzed' },
    viewThumbnails: { pending: 'Viewing thumbnails...', resolved: 'Thumbnails loaded' },
    getVideoComments: { pending: 'Loading comments...', resolved: 'Comments loaded' },
    getChannelOverview: { pending: 'Loading channel overview...', resolved: 'Channel overview loaded' },
    browseChannelVideos: { pending: 'Browsing channel videos...', resolved: 'Channel videos loaded' },
    listTrendChannels: { pending: 'Loading trend channels...', resolved: 'Trend channels loaded' },
    browseTrendVideos: { pending: 'Browsing trend videos...', resolved: 'Trend videos loaded' },
    getNicheSnapshot: { pending: 'Analyzing niche...', resolved: 'Niche analyzed' },
    findSimilarVideos: { pending: 'Finding similar videos...', resolved: 'Similar videos found' },
    searchDatabase: { pending: 'Searching database...', resolved: 'Search complete' },
    saveKnowledge: { pending: 'Saving knowledge...', resolved: 'Knowledge saved' },
    listKnowledge: { pending: 'Loading knowledge...', resolved: 'Knowledge loaded' },
    getKnowledge: { pending: 'Reading knowledge...', resolved: 'Knowledge loaded' },
    saveMemory: { pending: 'Saving memory...', resolved: 'Memory saved' },
};

/** Tools whose expand details are visible to all users (not just dev mode). */
const USER_EXPANDABLE = new Set(['saveKnowledge', 'saveMemory', 'listKnowledge', 'getKnowledge']);

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
    // KI tools: show title from args (content is stripped at persist)
    if (record.name === 'saveKnowledge') {
        const args = record.args as Record<string, unknown> | undefined;
        return (args?.title as string) || null;
    }
    if (record.name === 'saveMemory') {
        return (r.memoryId as string) ? 'Conversation memorized' : null;
    }
    return null;
}

/** Extract expandable detail for KI tools (visible to all users). */
function getKiDetail(record: ToolCallRecord): { summary?: string; category?: string; id?: string } | null {
    if (!record.result) return null;
    const args = record.args as Record<string, unknown> | undefined;
    const result = record.result as Record<string, unknown>;
    if (record.name === 'saveKnowledge') {
        return {
            summary: (args?.summary as string) || undefined,
            category: (args?.category as string)?.replace(/-/g, ' ') || undefined,
            id: (result.id as string) || undefined,
        };
    }
    if (record.name === 'saveMemory') {
        return {
            id: (result.memoryId as string) || undefined,
        };
    }
    return null;
}

interface ToolCallBadgeProps {
    record: ToolCallRecord;
    /** Optional real-time progress message emitted during tool execution (toolProgress SSE event). */
    progressMessage?: string;
}

export const ToolCallBadge: React.FC<ToolCallBadgeProps> = ({ record, progressMessage }) => {
    const [expanded, setExpanded] = useState(false);

    const isResolved = record.result !== undefined;
    const isError = isResolved && record.result?.error != null;

    const title = getResultTitle(record);
    const label = isError
        ? String(record.result?.error)
        : title
            ? `${getToolLabel(record.name, true)}: "${title}"`
            : (!isResolved && progressMessage)
                ? progressMessage
                : getToolLabel(record.name, isResolved);

    // Color scheme based on state
    const stateClasses = isError
        ? 'bg-red-500/[0.06] text-red-400'
        : isResolved
            ? 'bg-emerald-500/[0.06] text-emerald-400'
            : 'bg-blue-400/[0.06] text-blue-400';

    const isDev = import.meta.env.DEV;
    const isUserExpandable = USER_EXPANDABLE.has(record.name);
    const canExpand = (isDev || isUserExpandable) && isResolved;
    const kiDetail = isUserExpandable ? getKiDetail(record) : null;

    return (
        <div className="inline-flex flex-col max-w-full">
            <button
                type="button"
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] leading-tight transition-colors duration-200 ${stateClasses} ${canExpand ? 'cursor-pointer hover:brightness-125' : 'cursor-default'} ${!isResolved ? 'animate-stream-pulse' : ''}`}
                onClick={() => canExpand && setExpanded(v => !v)}
                disabled={!canExpand}
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

                {/* Expand chevron */}
                {canExpand && (
                    <ChevronDown
                        size={10}
                        className={`shrink-0 opacity-50 transition-transform duration-150 ${expanded ? 'rotate-180' : ''}`}
                    />
                )}
            </button>

            {/* Expandable details — KI tools: user-friendly summary; others: dev JSON */}
            {expanded && isResolved && (
                <div className="mt-1 ml-2 p-2 rounded-md bg-white/[0.03] border border-white/[0.06] text-[10px] text-text-tertiary leading-relaxed overflow-x-auto max-w-full">
                    {kiDetail ? (
                        <div className="font-sans space-y-1">
                            {kiDetail.category && (
                                <span className="text-accent uppercase tracking-wider font-medium">{kiDetail.category}</span>
                            )}
                            {kiDetail.summary && (
                                <p className="text-text-secondary leading-relaxed">{kiDetail.summary}</p>
                            )}
                            {kiDetail.id && (
                                <span className="text-text-tertiary opacity-50">ID: {kiDetail.id}</span>
                            )}
                        </div>
                    ) : isDev && (
                        <>
                            <div className="mb-1 text-text-secondary font-sans text-[10px] opacity-70">
                                {record.name}({JSON.stringify(record.args)})
                            </div>
                            <pre className="whitespace-pre-wrap break-all m-0 font-mono">
                                {JSON.stringify(record.result, null, 2)}
                            </pre>
                        </>
                    )}
                </div>
            )}
        </div>
    );
};
