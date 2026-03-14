/**
 * Type definitions for RichTextEditor component
 */

export interface RichTextEditorProps {
    /** Markdown content value */
    value: string
    /** Callback when content changes, receives markdown string */
    onChange: (value: string) => void
    /** Placeholder text shown when editor is empty */
    placeholder?: string
    /** Additional CSS classes for the editor container */
    className?: string
}
