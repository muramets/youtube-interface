import React from 'react';

/** Compact stats for editKnowledge expanded view. */
export const EditKnowledgeStats: React.FC<{ result: Record<string, unknown> }> = ({ result }) => {
    const title = result.title as string | undefined;
    const category = result.category as string | undefined;
    const contentLength = result.contentLength as number | undefined;

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
