import { useMemo } from 'react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import { Color } from '@tiptap/extension-color'
import { TextStyle } from '@tiptap/extension-text-style'
import TextAlign from '@tiptap/extension-text-align'
import { Code as TiptapCode } from '@tiptap/extension-code'
import { CodeBlock as TiptapCodeBlock } from '@tiptap/extension-code-block'
import { Table } from '@tiptap/extension-table'
import { TableRow } from '@tiptap/extension-table-row'
import { TableCell } from '@tiptap/extension-table-cell'
import { TableHeader } from '@tiptap/extension-table-header'
import { CollapsableHeadings } from '../extensions/CollapsableHeading'
import { IndentedListItem } from '../extensions/IndentedListItem'
import { TabIndentation } from '../extensions/TabIndentation'
import { CustomBlockquote } from '../extensions/CustomBlockquote'
import { VideoRefMark } from '../extensions/VideoRefMark'
import { VideoMention } from '../extensions/VideoMention'
import { Details, DetailsSummary, DetailsContent } from '../extensions/DetailsNode'
import type { VideoPreviewData } from '../../../../../features/Video/types'

/**
 * Custom hook for configuring Tiptap editor extensions.
 *
 * Business Logic:
 * - StarterKit provides basic editing features (bold, italic, lists, etc.)
 * - Custom extensions override defaults for specific behaviors
 * - Code and CodeBlock are customized to allow color marks inside
 * - ListItem is replaced with IndentedListItem for visual indentation
 * - Blockquote is replaced with CustomBlockquote for border color support
 * - TabIndentation enables Tab key for list indentation
 * - CollapsableHeadings adds IDE-like header collapsing
 *
 * @param placeholder - Placeholder text for empty editor
 * @returns Array of configured Tiptap extensions
 */
export function useEditorExtensions(placeholder?: string, videoCatalog?: VideoPreviewData[], defaultCollapsedLevel = 4) {
    /**
     * Custom Code Mark Extension
     *
     * Default Tiptap code mark excludes other marks (like color).
     * We override this to allow colored inline code.
     */
    const CustomCodeMark = useMemo(() => TiptapCode.extend({
        excludes: '', // Allow other marks (like Color) to coexist with inline code
    }), [])

    /**
     * Custom CodeBlock Node Extension
     *
     * Default code blocks don't allow marks inside.
     * We change content to 'inline*' to allow colored text in code blocks.
     */
    const CustomCodeBlockNode = useMemo(() => TiptapCodeBlock.extend({
        content: 'inline*', // Allow marks (like Color) inside code blocks
    }), [])

    return useMemo(() => [
        // StarterKit: Basic editing features
        StarterKit.configure({
            heading: {
                levels: [1, 2, 3, 4, 5, 6],
            },
            code: false, // Disabled in favor of CustomCodeMark
            codeBlock: false, // Disabled in favor of CustomCodeBlockNode
            listItem: false, // Disabled in favor of IndentedListItem
            blockquote: false, // Disabled in favor of CustomBlockquote
        }),

        // Custom list item with visual indentation support
        IndentedListItem,

        // Custom blockquote with border color support
        CustomBlockquote,

        // Custom code extensions with color support
        CustomCodeMark,
        CustomCodeBlockNode,

        // Tab key indentation for lists
        TabIndentation,

        // Details/Spoiler collapsible blocks
        Details,
        DetailsSummary,
        DetailsContent,

        // Placeholder text (with per-node support for details summary)
        Placeholder.configure({
            placeholder: ({ node }) => {
                if (node.type.name === 'detailsSummary') return 'Spoiler title...'
                return placeholder || 'Write something...'
            },
            includeChildren: true,
        }),

        // Text styling extensions
        TextStyle,
        Color,

        // Text alignment (left, center, right)
        TextAlign.configure({
            types: ['heading', 'paragraph'],
        }),

        // Table support
        Table.configure({
            resizable: true,
        }),
        TableRow,
        TableHeader,
        TableCell,

        // Collapsable headings (IDE-like)
        CollapsableHeadings.configure({ defaultCollapsedLevel }),

        // VideoRefMark: semantic vid:// links with React MarkView + tooltip
        VideoRefMark,

        // @-autocomplete for video references
        VideoMention.configure({
            videoCatalog: videoCatalog ?? [],
        }),
    ], [placeholder, videoCatalog, defaultCollapsedLevel, CustomCodeMark, CustomCodeBlockNode])
}
