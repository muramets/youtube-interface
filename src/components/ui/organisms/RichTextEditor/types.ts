/**
 * Type definitions for RichTextEditor component
 */

import type React from 'react'
import type { VideoPreviewData } from '../../../../features/Video/types'

/** Lightweight KI data for @-autocomplete and ki:// tooltips */
export interface KiPreviewData {
    id: string
    title: string
    category: string
    summary: string
    scope: 'video' | 'channel'
}

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
    /** Knowledge Item catalog for @-autocomplete and ki:// tooltips in edit mode */
    knowledgeCatalog?: KiPreviewData[]
    /** Extra toolbar content rendered in expanded mode (e.g. version dropdown) */
    expandedToolbarExtra?: React.ReactNode
    /** Side panel rendered alongside editor in expanded mode (e.g. diff panel) */
    expandedSidePanel?: React.ReactNode
    /** Headings at this level and above are collapsed by default (4 = h4+, 1 = all collapsed) */
    defaultCollapsedLevel?: number
}
