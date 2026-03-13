// =============================================================================
// RichTextViewer — Read-only Markdown renderer
//
// Renders Markdown content using react-markdown with prose styling.
// Used in KnowledgeCard (collapsed/expanded) and Zen Mode.
// =============================================================================

import ReactMarkdown from 'react-markdown';

interface RichTextViewerProps {
    /** Markdown content to render */
    content: string;
    /** Additional CSS classes */
    className?: string;
}

export const RichTextViewer: React.FC<RichTextViewerProps> = ({ content, className = '' }) => {
    if (!content) return null;

    return (
        <div className={`prose prose-sm dark:prose-invert max-w-none ${className}`}>
            <ReactMarkdown>{content}</ReactMarkdown>
        </div>
    );
};
