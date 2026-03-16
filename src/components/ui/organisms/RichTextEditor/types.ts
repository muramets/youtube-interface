/**
 * Type definitions for RichTextEditor component
 */

import type { VideoPreviewData } from '../../../../features/Video/types'

export interface RichTextEditorProps {
    /** Markdown content value */
    value: string
    /** Callback when content changes, receives markdown string */
    onChange: (value: string) => void
    /** Placeholder text shown when editor is empty */
    placeholder?: string
    /** Additional CSS classes for the editor container */
    className?: string
    /** Video catalog for @-autocomplete and vid:// tooltips in edit mode */
    videoCatalog?: VideoPreviewData[]
}
