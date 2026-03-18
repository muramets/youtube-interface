import { Editor } from '@tiptap/react'
import { useState, useEffect } from 'react'
import clsx from 'clsx'
import {
    Bold, Italic, Underline, List, ListOrdered, Heading1, Heading2, Heading3,
    Heading4, Heading5, Heading6, Maximize, Minimize,
    AlignLeft, AlignCenter, AlignRight, Code, SquareCode, Minus, Table as TableIcon, Bug,
    EyeOff
} from 'lucide-react'
import { MenuButton } from './MenuButton'
import { ColorPicker } from './ColorPicker'
import { QuoteColorPicker } from './QuoteColorPicker'
import { TableMenu } from './TableMenu'
import { MoreMenu } from './MoreMenu'

/**
 * MenuBar Component
 *
 * Main toolbar for the RichTextEditor.
 *
 * Features:
 * - Expandable mode (Zen): Shows ALL tools in the main toolbar, hides More menu
 * - Compact mode: Hides less common tools, accessible via More menu
 * - Always visible: Bold, Italic, Underline, Lists, Color picker
 * - Contextual: Table menu appears when inside a table
 * - Overflow menu: Only visible in compact mode
 */

interface MenuBarProps {
    editor: Editor | null
    isExpanded: boolean
    toggleExpand: () => void
    showDebug: boolean
    toggleDebug: () => void
    expandedToolbarExtra?: React.ReactNode
}

export const MenuBar = ({
    editor,
    isExpanded,
    toggleExpand,
    showDebug,
    toggleDebug,
    expandedToolbarExtra,
}: MenuBarProps) => {
    // Force re-render on editor updates to ensure button states (active/disabled) are current
    const [, forceUpdate] = useState({})

    useEffect(() => {
        if (!editor) return

        const updateHandler = () => forceUpdate({})

        editor.on('transaction', updateHandler)
        editor.on('selectionUpdate', updateHandler)

        return () => {
            editor.off('transaction', updateHandler)
            editor.off('selectionUpdate', updateHandler)
        }
    }, [editor])

    if (!editor) {
        return null
    }

    return (
        <div className={clsx(
            "flex items-center gap-1 border-b border-border pb-2 mb-2 min-h-[42px]",
            isExpanded ? "flex-wrap" : "flex-nowrap overflow-x-auto custom-scrollbar scrollbar-hide"
        )}>
            {/* 1. Text formatting */}
            <MenuButton
                onClick={() => editor.chain().focus().toggleBold().run()}
                isActive={editor.isActive('bold')}
                disabled={editor.isActive('blockquote')}
                tooltip="Bold"
            >
                <Bold size={16} />
            </MenuButton>
            <MenuButton
                onClick={() => editor.chain().focus().toggleItalic().run()}
                isActive={editor.isActive('italic')}
                tooltip="Italic"
            >
                <Italic size={16} />
            </MenuButton>
            <MenuButton
                onClick={() => editor.chain().focus().toggleUnderline().run()}
                isActive={editor.isActive('underline')}
                tooltip="Underline"
            >
                <Underline size={16} />
            </MenuButton>

            <div className="w-px h-4 bg-border mx-1 shrink-0" />

            {/* 2. Lists */}
            <MenuButton
                onClick={() => editor.chain().focus().toggleBulletList().run()}
                isActive={editor.isActive('bulletList')}
                tooltip="Bullet List"
            >
                <List size={16} />
            </MenuButton>
            <MenuButton
                onClick={() => editor.chain().focus().toggleOrderedList().run()}
                isActive={editor.isActive('orderedList')}
                tooltip="Ordered List"
            >
                <ListOrdered size={16} />
            </MenuButton>

            <div className="w-px h-4 bg-border mx-1 shrink-0" />

            {/* 3. Quote with color picker */}
            <QuoteColorPicker editor={editor} />

            <div className="w-px h-4 bg-border mx-1 shrink-0" />

            {/* 4. Color picker */}
            <ColorPicker editor={editor} />

            {/* Zen Mode Layout */}
            {isExpanded ? (
                <>
                    {/* Horizontal Rule (Divider Button) */}
                    <MenuButton
                        onClick={() => editor.chain().focus().setHorizontalRule().run()}
                        isActive={false}
                        tooltip="Divide"
                    >
                        <Minus size={16} />
                    </MenuButton>

                    <div className="w-px h-4 bg-border mx-1 shrink-0" />

                    {/* Headings */}
                    <MenuButton onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} isActive={editor.isActive('heading', { level: 1 })} tooltip="Heading 1"><Heading1 size={16} /></MenuButton>
                    <MenuButton onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} isActive={editor.isActive('heading', { level: 2 })} tooltip="Heading 2"><Heading2 size={16} /></MenuButton>
                    <MenuButton onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} isActive={editor.isActive('heading', { level: 3 })} tooltip="Heading 3"><Heading3 size={16} /></MenuButton>
                    <MenuButton onClick={() => editor.chain().focus().toggleHeading({ level: 4 }).run()} isActive={editor.isActive('heading', { level: 4 })} tooltip="Heading 4"><Heading4 size={16} /></MenuButton>
                    <MenuButton onClick={() => editor.chain().focus().toggleHeading({ level: 5 }).run()} isActive={editor.isActive('heading', { level: 5 })} tooltip="Heading 5"><Heading5 size={16} /></MenuButton>
                    <MenuButton onClick={() => editor.chain().focus().toggleHeading({ level: 6 }).run()} isActive={editor.isActive('heading', { level: 6 })} tooltip="Heading 6"><Heading6 size={16} /></MenuButton>

                    <div className="w-px h-4 bg-border mx-1 shrink-0" />

                    {/* Alignment Group */}
                    <div className="flex bg-text-secondary/10 rounded-lg p-0.5 gap-0.5">
                        <button
                            onClick={() => editor.chain().focus().setTextAlign('left').run()}
                            className={clsx(
                                "p-1 rounded transition-colors hover:bg-hover-bg hover:text-text-primary",
                                editor.isActive({ textAlign: 'left' }) ? "bg-hover-bg text-text-primary" : "text-text-secondary"
                            )}
                            title="Align Left"
                        >
                            <AlignLeft size={14} />
                        </button>
                        <button
                            onClick={() => editor.chain().focus().setTextAlign('center').run()}
                            className={clsx(
                                "p-1 rounded transition-colors hover:bg-hover-bg hover:text-text-primary",
                                editor.isActive({ textAlign: 'center' }) ? "bg-hover-bg text-text-primary" : "text-text-secondary"
                            )}
                            title="Align Center"
                        >
                            <AlignCenter size={14} />
                        </button>
                        <button
                            onClick={() => editor.chain().focus().setTextAlign('right').run()}
                            className={clsx(
                                "p-1 rounded transition-colors hover:bg-hover-bg hover:text-text-primary",
                                editor.isActive({ textAlign: 'right' }) ? "bg-hover-bg text-text-primary" : "text-text-secondary"
                            )}
                            title="Align Right"
                        >
                            <AlignRight size={14} />
                        </button>
                    </div>

                    <div className="w-px h-4 bg-border mx-1 shrink-0" />

                    {/* Code */}
                    <MenuButton
                        onClick={() => editor.chain().focus().toggleCode().run()}
                        isActive={editor.isActive('code')}
                        tooltip="Inline Code"
                    >
                        <Code size={16} />
                    </MenuButton>
                    <MenuButton
                        onClick={() => editor.chain().focus().toggleCodeBlock().run()}
                        isActive={editor.isActive('codeBlock')}
                        tooltip="Code Block"
                    >
                        <SquareCode size={16} />
                    </MenuButton>

                    <div className="w-px h-4 bg-border mx-1 shrink-0" />

                    {/* Spoiler/Details block */}
                    <MenuButton
                        onClick={() => {
                            if (editor.isActive('detailsSummary')) {
                                editor.chain().focus().unsetDetails().run()
                            } else {
                                editor.chain().focus().setDetails().run()
                            }
                        }}
                        isActive={editor.isActive('details')}
                        tooltip="Spoiler"
                    >
                        <EyeOff size={16} />
                    </MenuButton>

                    <div className="w-px h-4 bg-border mx-1 shrink-0" />

                    {/* Table: insert when outside, contextual menu when inside */}
                    {editor.isActive('table') ? (
                        <TableMenu editor={editor} />
                    ) : (
                        <MenuButton
                            onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}
                            isActive={false}
                            tooltip="Insert Table"
                        >
                            <TableIcon size={16} />
                        </MenuButton>
                    )}

                </>
            ) : (
                <>
                    {/* Table Menu (Contextual for Compact Mode) */}
                    {editor.isActive('table') && (
                        <>
                            <div className="w-px h-4 bg-border mx-1 shrink-0" />
                            <TableMenu editor={editor} />
                        </>
                    )}

                    {/* Spacer for Compact Mode */}
                    <div className="flex-1 min-w-4" />

                    {/* More Menu for Compact Mode */}
                    <MoreMenu
                        editor={editor}
                        showDebug={showDebug}
                        toggleDebug={toggleDebug}
                    />
                </>
            )}

            {/* Extra toolbar content from parent (e.g. version dropdown) */}
            {isExpanded && expandedToolbarExtra}

            {/* Right Aligned Spacer for Zen Mode */}
            {isExpanded && <div className="flex-1 min-w-4" />}

            {/* Zen Mode Right Actions */}
            {isExpanded && (
                <MenuButton
                    onClick={toggleDebug}
                    isActive={showDebug}
                    tooltip="Debug View"
                >
                    <Bug size={16} />
                </MenuButton>
            )}

            {/* Expand/Collapse Toggle - Always at the end */}
            <MenuButton
                onClick={toggleExpand}
                isActive={isExpanded}
                tooltip={isExpanded ? "Collapse" : "Expand"}
            >
                {isExpanded ? <Minimize size={16} /> : <Maximize size={16} />}
            </MenuButton>
        </div>
    )
}
