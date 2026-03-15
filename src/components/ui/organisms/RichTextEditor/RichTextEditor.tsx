import { useState, useEffect } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import { createPortal } from 'react-dom'
import clsx from 'clsx'
import type { RichTextEditorProps } from './types'
import { EDITOR_PROSE_CLASSES } from './constants/editorStyles'
import { parseMarkdownToHTML } from './utils/markdownParser'
import { stripColorStyles } from './utils/htmlProcessor'
import { useTurndownService } from './hooks/useTurndownService'
import { useMarkdownSync } from './hooks/useMarkdownSync'
import { useEditorExtensions } from './hooks/useEditorExtensions'
import { MenuBar } from './components/MenuBar'
import { DebugPanel } from './components/DebugPanel'

/**
 * RichTextEditor Component
 *
 * A feature-rich markdown editor built on Tiptap with:
 * - WYSIWYG editing with markdown storage
 * - Collapsable headings (IDE-like)
 * - Visual list indentation
 * - Text formatting (bold, italic, colors, alignment)
 * - Tables with full manipulation
 * - Code blocks and inline code
 * - Zen mode (fullscreen editing)
 * - Debug panel for development
 *
 * Business Logic:
 * - Content is stored as Markdown but edited as HTML
 * - Bidirectional conversion: Markdown <-> HTML via marked/Turndown
 * - Empty paragraphs are preserved using &nbsp; in markdown
 * - External paste strips colors, internal paste preserves formatting
 * - Headers h4-h6 are collapsed by default (see CollapsableHeadings)
 * - Tab key provides smart list indentation (structural + visual)
 */
export const RichTextEditor = ({
    value,
    onChange,
    placeholder,
    className,
    videoIds,
}: RichTextEditorProps) => {
    // UI state
    const [showDebug, setShowDebug] = useState(false)
    const [isExpanded, setIsExpanded] = useState(false)

    // Get configured Turndown service
    const turndownService = useTurndownService()

    // Get configured Tiptap extensions
    const extensions = useEditorExtensions(placeholder, videoIds)

    /**
     * Parse initial markdown value to HTML for Tiptap
     * Only done once to avoid cursor jumps on every parent re-render
     */
    const [initialContent] = useState(() => parseMarkdownToHTML(value))

    /**
     * Initialize Tiptap editor
     */
    const editor = useEditor({
        extensions,
        content: initialContent,

        // Editor props configuration
        editorProps: {
            attributes: {
                class: EDITOR_PROSE_CLASSES,
            },

            /**
             * Transform pasted HTML to strip unwanted formatting
             *
             * Business Logic:
             * - Internal paste (from editor): preserve all formatting
             * - External paste: strip color/background styles only
             */
            transformPastedHTML(html) {
                return stripColorStyles(html)
            },
        },
    })

    /**
     * Update editor classes when expansion state changes
     * In expanded mode, editor content should fill available height
     */
    useEffect(() => {
        if (!editor) return

        editor.setOptions({
            editorProps: {
                attributes: {
                    class: clsx(
                        EDITOR_PROSE_CLASSES,
                        isExpanded && 'h-full'
                    ),
                },
                transformPastedHTML(html) {
                    return stripColorStyles(html)
                },
            },
        })
    }, [isExpanded, editor])

    /**
     * Sync markdown value with editor content
     * Handles bidirectional conversion and prevents cursor jumps
     */
    useMarkdownSync(editor, value, onChange, turndownService)

    /**
     * Normal (compact) view
     */
    const NormalView = (
        <div className={clsx(
            "flex flex-col bg-bg-secondary rounded-lg p-3 transition-all duration-300",
            className
        )}>
            <MenuBar
                editor={editor}
                isExpanded={false}
                toggleExpand={() => setIsExpanded(true)}
                showDebug={showDebug}
                toggleDebug={() => setShowDebug(!showDebug)}
            />

            {!isExpanded ? (
                <div className="overflow-y-auto scrollbar-auto-hide flex-1 w-full min-h-[100px]">
                    <EditorContent editor={editor} className="text-text-primary" />
                    {showDebug && editor && <DebugPanel editor={editor} />}
                </div>
            ) : (
                <div className="min-h-[100px]" />
            )}
        </div>
    )

    /**
     * Expanded (zen) view - fullscreen modal
     */
    const ExpandedView = (
        <div className="fixed inset-0 z-modal bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 sm:p-8 animate-fade-in">
            <div className="flex flex-col w-full bg-bg-secondary max-w-4xl mx-auto rounded-xl shadow-2xl p-6 h-[85vh] border border-border">
                <MenuBar
                    editor={editor}
                    isExpanded={true}
                    toggleExpand={() => setIsExpanded(false)}
                    showDebug={showDebug}
                    toggleDebug={() => setShowDebug(!showDebug)}
                />

                <div className="flex-grow overflow-y-auto mt-4 scrollbar-auto-hide">
                    <EditorContent editor={editor} className="text-text-primary" />
                    {showDebug && editor && <DebugPanel editor={editor} />}
                </div>
            </div>
        </div>
    )

    return (
        <>
            {NormalView}
            {isExpanded && createPortal(ExpandedView, document.body)}
        </>
    )
}
