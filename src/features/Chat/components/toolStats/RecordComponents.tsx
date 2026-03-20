import React from 'react';
import type { ToolCallRecord } from '../../../../core/types/chat/chat';

/** Per-record expanded content for saveKnowledge pill. */
export const SaveKnowledgeRecord: React.FC<{ record: ToolCallRecord }> = ({ record }) => {
    const args = record.args as Record<string, unknown> | undefined;
    const result = record.result as Record<string, unknown> | undefined;
    const skipped = Boolean(result?.skipped);

    return (
        <div className="px-2 py-1.5 rounded-md bg-white/[0.03] text-[11px] min-w-0">
            <div className="flex flex-col gap-0.5">
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
    );
};

/** Per-record expanded content for editKnowledge pill. */
export const EditKnowledgeRecord: React.FC<{ record: ToolCallRecord }> = ({ record }) => {
    const result = record.result as Record<string, unknown> | undefined;
    const title = result?.title as string | undefined;
    const category = result?.category as string | undefined;
    const contentLength = result?.contentLength as number | undefined;

    return (
        <div className="px-2 py-1.5 rounded-md bg-white/[0.03] text-[11px] min-w-0">
            <div className="flex flex-col gap-0.5">
                {category && (
                    <span className="text-[9px] font-medium text-accent uppercase tracking-wider">
                        {category.replace(/-/g, ' ')}
                    </span>
                )}
                {title && <span className="text-text-primary truncate">{title}</span>}
                {contentLength != null && (
                    <span className="text-text-tertiary">
                        {contentLength.toLocaleString()} chars
                    </span>
                )}
            </div>
        </div>
    );
};

/** Per-record expanded content for saveMemory pill. */
export const SaveMemoryRecord: React.FC<{ record: ToolCallRecord }> = ({ record }) => {
    const result = record.result as Record<string, unknown> | undefined;
    return (
        <div className="px-2 py-1.5 rounded-md bg-white/[0.03] text-[11px] min-w-0">
            <span className="text-text-secondary">{result?.memoryId ? 'Conversation memorized' : 'Memory saved'}</span>
        </div>
    );
};
