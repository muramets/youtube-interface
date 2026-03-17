/**
 * Type definitions for RichTextEditor component
 */

import type React from 'react'
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
    /** Extra toolbar content rendered in expanded mode (e.g. version dropdown) */
    expandedToolbarExtra?: React.ReactNode
    /** Side panel rendered alongside editor in expanded mode (e.g. diff panel) */
    expandedSidePanel?: React.ReactNode
    /** Headings at this level and above are collapsed by default (4 = h4+, 1 = all collapsed) */
    defaultCollapsedLevel?: number
}
