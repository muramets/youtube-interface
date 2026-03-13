// =============================================================================
// KnowledgeItemModal — Edit modal for a Knowledge Item
//
// Features: title editing, RichTextEditor for content, save/cancel.
// Provenance fields (model, toolsUsed, createdAt) are read-only.
// =============================================================================

import { useState, useCallback } from 'react';
import { X, Bot, Calendar, Wrench } from 'lucide-react';
import type { KnowledgeItem } from '../../../core/types/knowledge';
import { RichTextEditor } from '../../../components/ui/RichTextEditor';

interface KnowledgeItemModalProps {
    item: KnowledgeItem;
    onSave: (updates: { title: string; content: string; summary?: string }) => void;
    onClose: () => void;
    /** Whether save is in progress */
    isSaving?: boolean;
}

export const KnowledgeItemModal: React.FC<KnowledgeItemModalProps> = ({
    item,
    onSave,
    onClose,
    isSaving = false,
}) => {
    const [title, setTitle] = useState(item.title);
    const [content, setContent] = useState(item.content);

    const handleSave = useCallback(() => {
        if (!title.trim() || !content.trim()) return;
        onSave({ title: title.trim(), content: content.trim() });
    }, [title, content, onSave]);

    const formattedDate = item.createdAt
        ? (item.createdAt.toDate?.() ?? new Date(item.createdAt as never)).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        })
        : 'Unknown';

    const hasChanges = title !== item.title || content !== item.content;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={onClose}>
            {/* Backdrop */}
            <div className="absolute inset-0 bg-black/50" />

            {/* Modal */}
            <div
                className="relative z-10 w-full max-w-3xl max-h-[85vh] mx-4 rounded-xl bg-[var(--color-bg-primary)] border border-[var(--color-border)] shadow-2xl flex flex-col overflow-hidden"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between gap-4 px-6 py-4 border-b border-[var(--color-border)]">
                    <h2 className="text-base font-semibold text-[var(--color-text-primary)]">
                        Edit Knowledge Item
                    </h2>
                    <button
                        onClick={onClose}
                        className="p-1.5 rounded-lg text-[var(--color-text-tertiary)] hover:bg-[var(--color-bg-tertiary)] hover:text-[var(--color-text-primary)] transition-colors"
                    >
                        <X size={18} />
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6 space-y-4">
                    {/* Provenance (read-only) */}
                    <div className="flex flex-wrap items-center gap-3 text-xs text-[var(--color-text-tertiary)]">
                        <span className="px-2 py-0.5 rounded bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)] uppercase tracking-wider font-medium">
                            {item.category}
                        </span>
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
                        {item.toolsUsed && item.toolsUsed.length > 0 && (
                            <span className="flex items-center gap-1">
                                <Wrench size={12} />
                                {item.toolsUsed.join(', ')}
                            </span>
                        )}
                    </div>

                    {/* Title */}
                    <div>
                        <label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1">
                            Title
                        </label>
                        <input
                            type="text"
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-primary)] text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/50 focus:border-[var(--color-accent)]"
                            placeholder="Knowledge item title"
                        />
                    </div>

                    {/* Content */}
                    <div>
                        <label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1">
                            Content
                        </label>
                        <RichTextEditor
                            value={content}
                            onChange={setContent}
                            placeholder="Write your analysis..."
                            minHeight={300}
                        />
                    </div>
                </div>

                {/* Footer */}
                <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-[var(--color-border)] bg-[var(--color-bg-secondary)]">
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-4 py-2 text-sm font-medium rounded-lg text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-tertiary)] transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        onClick={handleSave}
                        disabled={isSaving || !hasChanges || !title.trim() || !content.trim()}
                        className="px-4 py-2 text-sm font-medium rounded-lg bg-[var(--color-accent)] text-white hover:bg-[var(--color-accent-hover)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                        {isSaving ? 'Saving...' : 'Save'}
                    </button>
                </div>
            </div>
        </div>
    );
};
