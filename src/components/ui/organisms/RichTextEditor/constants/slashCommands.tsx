import {
    Heading1, Heading2, Heading3,
    List, ListOrdered, Quote, Code,
    Minus, Table as TableIcon, EyeOff,
} from 'lucide-react'
import type { Editor } from '@tiptap/core'
import type { Range } from '@tiptap/core'

export interface SlashCommandItem {
    label: string
    icon: React.ReactNode
    keywords: string[]
    action: (editor: Editor, range: Range) => void
}

export const SLASH_COMMANDS: SlashCommandItem[] = [
    {
        label: 'Heading 1',
        icon: <Heading1 size={16} />,
        keywords: ['heading', 'h1', 'title'],
        action: (editor, range) =>
            editor.chain().focus().deleteRange(range).toggleHeading({ level: 1 }).run(),
    },
    {
        label: 'Heading 2',
        icon: <Heading2 size={16} />,
        keywords: ['heading', 'h2', 'subtitle'],
        action: (editor, range) =>
            editor.chain().focus().deleteRange(range).toggleHeading({ level: 2 }).run(),
    },
    {
        label: 'Heading 3',
        icon: <Heading3 size={16} />,
        keywords: ['heading', 'h3'],
        action: (editor, range) =>
            editor.chain().focus().deleteRange(range).toggleHeading({ level: 3 }).run(),
    },
    {
        label: 'Bullet List',
        icon: <List size={16} />,
        keywords: ['bullet', 'list', 'unordered', 'ul'],
        action: (editor, range) =>
            editor.chain().focus().deleteRange(range).toggleBulletList().run(),
    },
    {
        label: 'Ordered List',
        icon: <ListOrdered size={16} />,
        keywords: ['ordered', 'list', 'number', 'ol'],
        action: (editor, range) =>
            editor.chain().focus().deleteRange(range).toggleOrderedList().run(),
    },
    {
        label: 'Blockquote',
        icon: <Quote size={16} />,
        keywords: ['quote', 'blockquote', 'callout'],
        action: (editor, range) =>
            editor.chain().focus().deleteRange(range).toggleBlockquote().run(),
    },
    {
        label: 'Code Block',
        icon: <Code size={16} />,
        keywords: ['code', 'codeblock', 'pre'],
        action: (editor, range) =>
            editor.chain().focus().deleteRange(range).toggleCodeBlock().run(),
    },
    {
        label: 'Divider',
        icon: <Minus size={16} />,
        keywords: ['divider', 'horizontal', 'rule', 'hr', 'line'],
        action: (editor, range) =>
            editor.chain().focus().deleteRange(range).setHorizontalRule().run(),
    },
    {
        label: 'Table',
        icon: <TableIcon size={16} />,
        keywords: ['table', 'grid'],
        action: (editor, range) =>
            editor.chain().focus().deleteRange(range).insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(),
    },
    {
        label: 'Spoiler',
        icon: <EyeOff size={16} />,
        keywords: ['spoiler', 'details', 'collapse', 'toggle', 'hidden'],
        action: (editor, range) =>
            editor.chain().focus().deleteRange(range).setDetails().run(),
    },
]

export function filterSlashCommands(query: string): SlashCommandItem[] {
    if (!query) return SLASH_COMMANDS
    const q = query.toLowerCase()
    return SLASH_COMMANDS.filter(cmd =>
        cmd.label.toLowerCase().includes(q) ||
        cmd.keywords.some(k => k.includes(q))
    )
}
