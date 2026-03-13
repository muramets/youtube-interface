// =============================================================================
// KnowledgeViewer — Fullscreen "Zen Mode" viewer for Knowledge Items
//
// Portal-based overlay with backdrop blur, body scroll lock, ESC to close.
// Uses RichTextViewer for Markdown rendering.
// =============================================================================

import { useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { RichTextViewer } from '../../../components/ui/RichTextEditor';

interface KnowledgeViewerProps {
    /** Markdown content */
    content: string;
    /** Item title */
    title: string;
    /** Optional metadata line */
    meta?: {
        model: string;
        createdAt: string;
        category: string;
    };
    /** Close handler */
    onClose: () => void;
}

export const KnowledgeViewer: React.FC<KnowledgeViewerProps> = ({
    content,
    title,
    meta,
    onClose,
}) => {
    // ESC to close
    const handleKeyDown = useCallback((e: KeyboardEvent) => {
        if (e.key === 'Escape') onClose();
    }, [onClose]);

    useEffect(() => {
        document.addEventListener('keydown', handleKeyDown);
        // Body scroll lock
        const originalOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';

        return () => {
            document.removeEventListener('keydown', handleKeyDown);
            document.body.style.overflow = originalOverflow;
        };
    }, [handleKeyDown]);

    return createPortal(
        <div
            className="fixed inset-0 z-[100] flex items-center justify-center"
            onClick={onClose}
        >
            {/* Backdrop */}
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

            {/* Content panel */}
            <div
                className="relative z-10 w-full max-w-4xl max-h-[90vh] mx-4 rounded-xl bg-[var(--color-bg-primary)] border border-[var(--color-border)] shadow-2xl flex flex-col overflow-hidden"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-start justify-between gap-4 p-6 border-b border-[var(--color-border)]">
                    <div className="min-w-0">
                        <h2 className="text-lg font-semibold text-[var(--color-text-primary)] truncate">
                            {title}
                        </h2>
                        {meta && (
                            <p className="mt-1 text-xs text-[var(--color-text-tertiary)]">
                                {meta.category} &middot; {meta.model} &middot; {meta.createdAt}
                            </p>
                        )}
                    </div>
                    <button
                        onClick={onClose}
                        className="shrink-0 p-1.5 rounded-lg text-[var(--color-text-tertiary)] hover:bg-[var(--color-bg-tertiary)] hover:text-[var(--color-text-primary)] transition-colors"
                        title="Close (Esc)"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6">
                    <RichTextViewer content={content} />
                </div>
            </div>
        </div>,
        document.body,
    );
};
