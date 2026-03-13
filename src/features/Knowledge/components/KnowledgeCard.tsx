// =============================================================================
// KnowledgeCard — Collapsible card for a single Knowledge Item
//
// Collapsed: category badge, title, date, model, summary
// Expanded: full content via RichTextViewer + Maximize button (Zen Mode)
// Actions: Edit button → opens KnowledgeItemModal
// =============================================================================

import { useState } from 'react';
import { ChevronDown, ChevronRight, Pencil, Maximize2, Bot, Calendar } from 'lucide-react';
import type { KnowledgeItem } from '../../../core/types/knowledge';
import { RichTextViewer } from '../../../components/ui/RichTextEditor';
import { KnowledgeViewer } from './KnowledgeViewer';

interface KnowledgeCardProps {
    item: KnowledgeItem;
    onEdit?: (item: KnowledgeItem) => void;
}

export const KnowledgeCard: React.FC<KnowledgeCardProps> = ({ item, onEdit }) => {
    const [isExpanded, setIsExpanded] = useState(false);
    const [isZenMode, setIsZenMode] = useState(false);

    const formattedDate = item.createdAt
        ? (item.createdAt.toDate?.() ?? new Date(item.createdAt as never)).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
        })
        : 'Unknown date';

    return (
        <>
            <div className="group rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-primary)] hover:border-[var(--color-border-hover)] transition-colors">
                {/* Header (always visible) */}
                <button
                    type="button"
                    onClick={() => setIsExpanded(!isExpanded)}
                    className="w-full flex items-start gap-3 p-3 text-left"
                >
                    {/* Expand chevron */}
                    <span className="mt-0.5 text-[var(--color-text-tertiary)] shrink-0">
                        {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                    </span>

                    <div className="flex-1 min-w-0">
                        {/* Top row: category + title */}
                        <div className="flex items-center gap-2">
                            <span className="shrink-0 px-1.5 py-0.5 text-[10px] font-medium rounded bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)] uppercase tracking-wider">
                                {item.category}
                            </span>
                            <h4 className="text-sm font-medium text-[var(--color-text-primary)] truncate">
                                {item.title}
                            </h4>
                        </div>

                        {/* Meta row */}
                        <div className="flex items-center gap-3 mt-1 text-xs text-[var(--color-text-tertiary)]">
                            <span className="flex items-center gap-1">
                                <Calendar size={12} />
                                {formattedDate}
                            </span>
                            {item.model && (
                                <span className="flex items-center gap-1">
                                    <Bot size={12} />
                                    {item.model}
                                </span>
                            )}
                        </div>

                        {/* Summary (collapsed only) */}
                        {!isExpanded && item.summary && (
                            <p className="mt-1.5 text-xs text-[var(--color-text-secondary)] line-clamp-2">
                                {item.summary}
                            </p>
                        )}
                    </div>

                    {/* Actions (visible on hover) */}
                    <div className="shrink-0 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        {onEdit && (
                            <span
                                role="button"
                                onClick={(e) => { e.stopPropagation(); onEdit(item); }}
                                className="p-1 rounded text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-tertiary)]"
                                title="Edit"
                            >
                                <Pencil size={14} />
                            </span>
                        )}
                    </div>
                </button>

                {/* Expanded content */}
                {isExpanded && (
                    <div className="px-3 pb-3 pt-0 border-t border-[var(--color-border)]">
                        <div className="flex justify-end mb-2 mt-2">
                            <button
                                type="button"
                                onClick={() => setIsZenMode(true)}
                                className="flex items-center gap-1 px-2 py-1 text-xs text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-tertiary)] rounded transition-colors"
                                title="Open in Zen Mode"
                            >
                                <Maximize2 size={12} />
                                Expand
                            </button>
                        </div>
                        <RichTextViewer content={item.content} />
                    </div>
                )}
            </div>

            {/* Zen Mode overlay */}
            {isZenMode && (
                <KnowledgeViewer
                    content={item.content}
                    title={item.title}
                    meta={{
                        model: item.model || 'Unknown',
                        createdAt: formattedDate,
                        category: item.category,
                    }}
                    onClose={() => setIsZenMode(false)}
                />
            )}
        </>
    );
};
