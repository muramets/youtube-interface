import { useState, useEffect, useMemo, useRef } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
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
import { VideoRefContext } from './extensions/VideoRefContext'
import { KiRefContext } from './extensions/KiRefContext'
import { buildCatalogVideoMap, buildCatalogKiMap } from './utils/catalogMaps'

/**
 * RichTextEditor Component
 *
 * Zen mode strategy: instead of Portal re-mount (which destroys Tiptap MarkView
 * instances), we move the editor's DOM node into a fullscreen overlay via
 * appendChild. React tree stays intact — no unmount/mount, marks survive.
 */

const COMPACT_CLASSES = 'flex flex-col bg-bg-secondary rounded-lg p-3 transition-all duration-300'
const EXPANDED_CLASSES = 'flex flex-col w-full bg-bg-secondary max-w-6xl mx-auto rounded-xl shadow-2xl p-6 h-[85vh] border border-border'
const EXPANDED_WIDE_CLASSES = 'flex flex-col w-full bg-bg-secondary mx-auto rounded-xl shadow-2xl p-6 h-[85vh] border border-border'

export const RichTextEditor = ({
    value,
    onChange,
    placeholder,
    className,
    videoCatalog,
    knowledgeCatalog,
    expandedToolbarExtra,
    expandedSidePanel,
    defaultCollapsedLevel,
}: RichTextEditorProps) => {
    const [showDebug, setShowDebug] = useState(false)
    const [isExpanded, setIsExpanded] = useState(false)

    const turndownService = useTurndownService()
    const extensions = useEditorExtensions(placeholder, videoCatalog, knowledgeCatalog, defaultCollapsedLevel)

    const videoMap = useMemo(() => buildCatalogVideoMap(videoCatalog), [videoCatalog])
    const kiMap = useMemo(() => buildCatalogKiMap(knowledgeCatalog), [knowledgeCatalog])

    const [initialContent] = useState(() => parseMarkdownToHTML(value))

    const editor = useEditor({
        extensions,
        content: initialContent,
        editorProps: {
            attributes: { class: EDITOR_PROSE_CLASSES },
            transformPastedHTML: stripColorStyles,
        },
    })

    useEffect(() => {
        if (!editor) return
        editor.setOptions({
            editorProps: {
                attributes: { class: clsx(EDITOR_PROSE_CLASSES, isExpanded && 'h-full') },
                transformPastedHTML: stripColorStyles,
            },
        })
    }, [isExpanded, editor])

    useMarkdownSync(editor, value, onChange, turndownService)

    // --- Zen mode: DOM-level move (no React re-mount) ---

    const hasSidePanel = !!expandedSidePanel
    const editorCardRef = useRef<HTMLDivElement>(null)
    const placeholderRef = useRef<HTMLDivElement | null>(null)
    const overlayRef = useRef<HTMLDivElement | null>(null)

    useEffect(() => {
        const card = editorCardRef.current
        if (!card) return

        if (isExpanded) {
            // Lock body scroll while Zen mode is active
            const prevOverflow = document.body.style.overflow
            document.body.style.overflow = 'hidden'

            // Create fullscreen overlay
            const overlay = document.createElement('div')
            overlay.className = 'fixed inset-0 z-tooltip bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 sm:p-8 animate-fade-in'
            overlay.addEventListener('mousedown', (e) => {
                if (e.target === overlay) setIsExpanded(false)
            })
            overlayRef.current = overlay

            // Create placeholder to preserve parent layout
            const ph = document.createElement('div')
            ph.style.height = `${card.offsetHeight}px`
            card.parentNode?.insertBefore(ph, card)
            placeholderRef.current = ph

            // Move editor card into overlay (no React unmount)
            overlay.appendChild(card)
            document.body.appendChild(overlay)

            // Apply expanded styles — wider when side panel is present
            card.className = hasSidePanel ? EXPANDED_WIDE_CLASSES : EXPANDED_CLASSES

            // ESC to close
            const handleEsc = (e: KeyboardEvent) => {
                if (e.key === 'Escape') setIsExpanded(false)
            }
            document.addEventListener('keydown', handleEsc)

            return () => {
                document.removeEventListener('keydown', handleEsc)
                document.body.style.overflow = prevOverflow

                // Remove any orphaned suggestion popups (@-mentions, /slash commands)
                document.querySelectorAll('[data-suggestion-popup]').forEach(el => el.remove())

                // Move card back
                const ph = placeholderRef.current
                if (ph?.parentNode) {
                    ph.parentNode.insertBefore(card, ph)
                    ph.remove()
                }
                placeholderRef.current = null

                // Remove overlay
                overlay.remove()
                overlayRef.current = null

                // Restore compact styles
                card.className = clsx(COMPACT_CLASSES, className)
            }
        }
    }, [isExpanded, className, hasSidePanel])

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            overlayRef.current?.remove()
            placeholderRef.current?.remove()
        }
    }, [])

    return (
        <KiRefContext.Provider value={kiMap}>
        <VideoRefContext.Provider value={videoMap}>
            <div
                ref={editorCardRef}
                className={clsx(COMPACT_CLASSES, className)}
            >
                <MenuBar
                    editor={editor}
                    isExpanded={isExpanded}
                    toggleExpand={() => setIsExpanded(v => !v)}
                    showDebug={showDebug}
                    toggleDebug={() => setShowDebug(!showDebug)}
                    expandedToolbarExtra={expandedToolbarExtra}
                />

                {/* Single React tree — EditorContent never unmounts when side panel toggles */}
                <div className={clsx(
                    'overflow-y-auto w-full min-h-0',
                    isExpanded && hasSidePanel
                        ? 'flex-grow mt-4 flex gap-4 overflow-hidden'
                        : isExpanded ? 'flex-grow mt-4' : 'flex-1 min-h-[100px]'
                )}>
                    {isExpanded && expandedSidePanel && (
                        <div className="w-1/2 overflow-y-auto border border-border rounded-lg flex-shrink-0">
                            {expandedSidePanel}
                        </div>
                    )}
                    <div className={clsx(
                        isExpanded && hasSidePanel ? 'w-1/2 overflow-y-auto' : 'w-full'
                    )}>
                        <EditorContent editor={editor} className="text-text-primary" />
                        {showDebug && editor && <DebugPanel editor={editor} />}
                    </div>
                </div>
            </div>
        </VideoRefContext.Provider>
        </KiRefContext.Provider>
    )
}
