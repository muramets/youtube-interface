import React from 'react';
import type { ToolCallRecord } from '../../../../core/types/chat/chat';
import type { VideoPreviewData } from '../../../Video/types';

// --- Shared thumbnail helper ---

/** Inline video thumbnail (w-14 h-8) from videoMap, or nothing if videoId absent / not in map. */
const KiThumbnail: React.FC<{ videoId?: string; videoMap?: Map<string, VideoPreviewData> }> = ({ videoId, videoMap }) => {
    if (!videoId) return null;
    const url = videoMap?.get(videoId)?.thumbnailUrl;
    if (!url) return null;
    return (
        <img
            src={url}
            alt=""
            className="w-14 h-8 object-cover rounded flex-shrink-0"
            loading="lazy"
        />
    );
};

// --- Knowledge Record/Stats Components ---

/** Per-record expanded content for saveKnowledge pill. */
export const SaveKnowledgeRecord: React.FC<{ record: ToolCallRecord; videoMap?: Map<string, VideoPreviewData> }> = ({ record, videoMap }) => {
    const args = record.args as Record<string, unknown> | undefined;
    const result = record.result as Record<string, unknown> | undefined;
    const skipped = Boolean(result?.skipped);
    const videoId = args?.videoId as string | undefined;

    return (
        <div className="px-2 py-1.5 rounded-md bg-surface-primary dark:bg-white/[0.03] text-[11px] min-w-0">
            <div className="flex items-center gap-2">
                <KiThumbnail videoId={videoId} videoMap={videoMap} />
                <div className="flex flex-col gap-0.5 min-w-0">
                    <div className="flex items-center gap-2">
                        <span className="text-[9px] font-medium text-accent uppercase tracking-wider">
                            {(args?.category as string)?.replace(/-/g, ' ')}
                        </span>
                        {skipped && <span className="text-[9px] text-text-tertiary">(already exists)</span>}
                    </div>
                    <span className="text-text-primary truncate">{String(args?.title ?? '')}</span>
                    {typeof args?.summary === 'string' && <span className="text-text-tertiary leading-relaxed line-clamp-2">{args.summary}</span>}
                </div>
            </div>
        </div>
    );
};

/** Format edit stats for display in pill. */
function formatEditStats(editStats: { mode: string; charsAdded: number; charsRemoved: number }): React.ReactNode {
    if (editStats.mode === 'rewrite') {
        return <>{editStats.charsAdded.toLocaleString()} chars rewritten</>;
    }
    // Operations mode: show +added / -removed
    const parts: React.ReactNode[] = [];
    if (editStats.charsAdded > 0) {
        parts.push(<span key="add" style={{ color: 'var(--color-success)' }}>+{editStats.charsAdded.toLocaleString()}</span>);
    }
    if (editStats.charsRemoved > 0) {
        parts.push(<span key="rm" style={{ color: 'var(--color-error)' }}>−{editStats.charsRemoved.toLocaleString()}</span>);
    }
    if (parts.length === 0) return <>0 chars changed</>;
    return <>{parts.reduce<React.ReactNode[]>((acc, el, i) => i === 0 ? [el] : [...acc, ' / ', el], [])} chars</>;
}

/** Per-record expanded content for editKnowledge pill. */
export const EditKnowledgeRecord: React.FC<{ record: ToolCallRecord; videoMap?: Map<string, VideoPreviewData> }> = ({ record, videoMap }) => {
    const result = record.result as Record<string, unknown> | undefined;
    const error = result?.error as string | undefined;
    const title = result?.title as string | undefined;
    const category = result?.category as string | undefined;
    const videoId = result?.videoId as string | undefined;
    const contentLength = result?.contentLength as number | undefined;
    const editStats = result?.editStats as { mode: string; charsAdded: number; charsRemoved: number } | undefined;

    if (error) {
        const isAnchorNotFound = error.includes('anchor not found') || error.includes('old_string not found');
        const isMultiple = error.includes('anchor found') && error.includes('times')
            || error.includes('old_string found') && error.includes('times');
        const isMutualExclusion = error.includes('Cannot use both');
        const opMatch = error.match(/^Operation (\d+):/);
        const opIndex = opMatch ? opMatch[1] : null;

        const reason = isMutualExclusion
            ? 'Conflicting parameters'
            : isMultiple
                ? 'Ambiguous match (multiple occurrences)'
                : isAnchorNotFound
                    ? 'Text not found in document'
                    : 'Edit failed';

        return (
            <div className="px-2 py-1.5 rounded-md bg-red-500/[0.06] text-[11px] min-w-0">
                <span className="text-red-400">
                    {reason}{opIndex != null && ` · op ${opIndex}`}
                </span>
            </div>
        );
    }

    return (
        <div className="px-2 py-1.5 rounded-md bg-surface-primary dark:bg-white/[0.03] text-[11px] min-w-0">
            <div className="flex items-center gap-2">
                <KiThumbnail videoId={videoId} videoMap={videoMap} />
                <div className="flex flex-col gap-0.5 min-w-0">
                    {category && (
                        <span className="text-[9px] font-medium text-accent uppercase tracking-wider">
                            {category.replace(/-/g, ' ')}
                        </span>
                    )}
                    {title && <span className="text-text-primary truncate">{title}</span>}
                    <span className="text-text-tertiary">
                        {editStats ? formatEditStats(editStats) : (
                            contentLength != null ? `${contentLength.toLocaleString()} chars` : null
                        )}
                    </span>
                </div>
            </div>
        </div>
    );
};

/** Stats component for listKnowledge pill — renders KI list from result.items. */
export const ListKnowledgeStats: React.FC<{ result: Record<string, unknown>; videoMap?: Map<string, VideoPreviewData> }> = ({ result, videoMap }) => {
    const items = result.items as Array<{ id?: string; title: string; category: string; summary?: string; videoId?: string }> | undefined;

    if (!items || items.length === 0) {
        return (
            <div className="px-2 py-1.5 text-[11px] text-text-tertiary">
                No existing KI — first analysis for this video
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-1">
            {items.map((item, i) => (
                <div key={item.id ?? i} className="px-2 py-1.5 rounded-md bg-surface-primary dark:bg-white/[0.03] text-[11px] min-w-0">
                    <div className="flex items-center gap-2">
                        <KiThumbnail videoId={item.videoId} videoMap={videoMap} />
                        <div className="flex flex-col gap-0.5 min-w-0">
                            {item.category && (
                                <span className="text-[9px] font-medium text-accent uppercase tracking-wider">
                                    {item.category.replace(/-/g, ' ')}
                                </span>
                            )}
                            <span className="text-text-primary truncate">{item.title}</span>
                            {item.summary && <span className="text-text-tertiary leading-relaxed line-clamp-2">{item.summary}</span>}
                        </div>
                    </div>
                </div>
            ))}
        </div>
    );
};

/** Stats component for getKnowledge pill — renders loaded KI metadata from result.items. */
export const GetKnowledgeStats: React.FC<{ result: Record<string, unknown>; videoMap?: Map<string, VideoPreviewData> }> = ({ result, videoMap }) => {
    const items = result.items as Array<{ id?: string; title: string; category: string; videoId?: string }> | undefined;

    if (!items || items.length === 0) {
        return (
            <div className="px-2 py-1.5 text-[11px] text-text-tertiary">
                No KI found for this criteria
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-1">
            {items.map((item, i) => (
                <div key={item.id ?? i} className="px-2 py-1.5 rounded-md bg-surface-primary dark:bg-white/[0.03] text-[11px] min-w-0">
                    <div className="flex items-center gap-2">
                        <KiThumbnail videoId={item.videoId} videoMap={videoMap} />
                        <div className="flex flex-col gap-0.5 min-w-0">
                            {item.category && (
                                <span className="text-[9px] font-medium text-accent uppercase tracking-wider">
                                    {item.category.replace(/-/g, ' ')}
                                </span>
                            )}
                            <span className="text-text-primary truncate">{item.title}</span>
                        </div>
                    </div>
                </div>
            ))}
        </div>
    );
};

/** Per-record expanded content for saveMemory pill. */
export const SaveMemoryRecord: React.FC<{ record: ToolCallRecord }> = ({ record }) => {
    const result = record.result as Record<string, unknown> | undefined;
    return (
        <div className="px-2 py-1.5 rounded-md bg-surface-primary dark:bg-white/[0.03] text-[11px] min-w-0">
            <span className="text-text-secondary">{result?.memoryId ? 'Conversation memorized' : 'Memory saved'}</span>
        </div>
    );
};

// --- Edit Memory diff helpers ---

interface MemoryEditOperation {
    type: 'replace' | 'insert_after' | 'insert_before';
    old_string?: string;
    new_string?: string;
    anchor?: string;
    content?: string;
}

const OP_LABEL: Record<string, string> = {
    replace: 'replace',
    insert_after: 'insert after',
    insert_before: 'insert before',
};

const DIFF_LINE_LIMIT = 200;

function truncateDiff(text: string): string {
    if (text.length <= DIFF_LINE_LIMIT) return text;
    return text.slice(0, DIFF_LINE_LIMIT) + '…';
}

/** Single operation diff block. */
const OperationDiff: React.FC<{ op: MemoryEditOperation; index: number }> = ({ op, index }) => (
    <div className="flex flex-col gap-0.5">
        <span className="text-[9px] text-text-tertiary uppercase tracking-wider">
            op {index} · {OP_LABEL[op.type] || op.type}
        </span>
        {op.type === 'replace' ? (
            <>
                {op.old_string && (
                    <pre className="px-1.5 py-1 rounded bg-red-500/[0.08] text-red-400 whitespace-pre-wrap break-words font-mono text-[10px] leading-relaxed">
                        − {truncateDiff(op.old_string)}
                    </pre>
                )}
                {op.new_string && (
                    <pre className="px-1.5 py-1 rounded bg-emerald-500/[0.08] text-emerald-400 whitespace-pre-wrap break-words font-mono text-[10px] leading-relaxed">
                        + {truncateDiff(op.new_string)}
                    </pre>
                )}
            </>
        ) : (
            <>
                {op.anchor && (
                    <pre className="px-1.5 py-1 rounded bg-white/[0.03] text-text-tertiary whitespace-pre-wrap break-words font-mono text-[10px] leading-relaxed">
                        ⚓ {truncateDiff(op.anchor)}
                    </pre>
                )}
                {op.content && (
                    <pre className="px-1.5 py-1 rounded bg-emerald-500/[0.08] text-emerald-400 whitespace-pre-wrap break-words font-mono text-[10px] leading-relaxed">
                        + {truncateDiff(op.content)}
                    </pre>
                )}
            </>
        )}
    </div>
);

/** Per-record expanded content for editMemory pill. */
export const EditMemoryRecord: React.FC<{ record: ToolCallRecord }> = ({ record }) => {
    const result = record.result as Record<string, unknown> | undefined;
    const args = record.args as Record<string, unknown> | undefined;
    const error = result?.error as string | undefined;
    const memoryTitle = result?.memoryTitle as string | undefined;
    const charsAdded = result?.charsAdded as number | undefined;
    const charsRemoved = result?.charsRemoved as number | undefined;
    const operations = args?.operations as MemoryEditOperation[] | undefined;

    if (error) {
        const isAnchorNotFound = error.includes('anchor not found') || error.includes('old_string not found');
        const isMultiple = (error.includes('anchor found') || error.includes('old_string found')) && error.includes('times');
        const isProtected = error.includes('protected');
        const opMatch = error.match(/^Operation (\d+):/);
        const opIndex = opMatch ? opMatch[1] : null;

        const reason = isProtected
            ? 'Memory is protected'
            : isMultiple
                ? 'Ambiguous match (multiple occurrences)'
                : isAnchorNotFound
                    ? 'Text not found in memory'
                    : 'Edit failed';

        return (
            <div className="px-2 py-1.5 rounded-md bg-red-500/[0.06] text-[11px] min-w-0">
                <span className="text-red-400">
                    {reason}{opIndex != null && ` · op ${opIndex}`}
                </span>
            </div>
        );
    }

    return (
        <div className="px-2 py-1.5 rounded-md bg-surface-primary dark:bg-white/[0.03] text-[11px] min-w-0">
            <div className="flex flex-col gap-1.5 min-w-0">
                {/* Header: title + stats */}
                <div className="flex items-center justify-between gap-2">
                    {memoryTitle && <span className="text-text-primary truncate">{memoryTitle}</span>}
                    <span className="text-text-tertiary shrink-0">
                        {charsAdded != null && charsRemoved != null
                            ? formatEditStats({ mode: 'operations', charsAdded, charsRemoved })
                            : 'Updated'}
                    </span>
                </div>
                {/* Operation diffs */}
                {operations && operations.length > 0 && (
                    <div className="flex flex-col gap-1.5">
                        {operations.map((op, i) => (
                            <OperationDiff key={i} op={op} index={i} />
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};
