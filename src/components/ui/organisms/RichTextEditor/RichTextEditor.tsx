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
import type { VideoPreviewData } from '../../../../features/Video/types'

/**
 * RichTextEditor Component
 *
 * Zen mode strategy: instead of Portal re-mount (which destroys Tiptap MarkView
 * instances), we move the editor's DOM node into a fullscreen overlay via
 * appendChild. React tree stays intact — no unmount/mount, marks survive.
 */
const EMPTY_MAP = new Map<string, VideoPreviewData>()

const COMPACT_CLASSES = 'flex flex-col bg-bg-secondary rounded-lg p-3 transition-all duration-300'
const EXPANDED_CLASSES = 'flex flex-col w-full bg-bg-secondary max-w-4xl mx-auto rounded-xl shadow-2xl p-6 h-[85vh] border border-border'

export const RichTextEditor = ({
    value,
    onChange,
    placeholder,
    className,
    videoCatalog,
}: RichTextEditorProps) => {
    const [showDebug, setShowDebug] = useState(false)
    const [isExpanded, setIsExpanded] = useState(false)

    const turndownService = useTurndownService()
    const extensions = useEditorExtensions(placeholder, videoCatalog)

    const videoMap = useMemo(() => {
        if (!videoCatalog?.length) return EMPTY_MAP
        const map = new Map<string, VideoPreviewData>()
        for (const v of videoCatalog) {
            map.set(v.videoId, v)
            if (v.youtubeVideoId && v.youtubeVideoId !== v.videoId) {
                map.set(v.youtubeVideoId, v)
            }
        }
        return map
    }, [videoCatalog])

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

    const editorCardRef = useRef<HTMLDivElement>(null)
    const placeholderRef = useRef<HTMLDivElement | null>(null)
    const overlayRef = useRef<HTMLDivElement | null>(null)

    useEffect(() => {
        const card = editorCardRef.current
        if (!card) return

        if (isExpanded) {
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

            // Apply expanded styles
            card.className = EXPANDED_CLASSES

            // ESC to close
            const handleEsc = (e: KeyboardEvent) => {
                if (e.key === 'Escape') setIsExpanded(false)
            }
            document.addEventListener('keydown', handleEsc)

            return () => {
                document.removeEventListener('keydown', handleEsc)

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
    }, [isExpanded, className])

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            overlayRef.current?.remove()
            placeholderRef.current?.remove()
        }
    }, [])

    return (
        <VideoRefContext.Provider value={videoMap ?? EMPTY_MAP}>
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
                />

                <div className={clsx(
                    'overflow-y-auto w-full',
                    isExpanded ? 'flex-grow mt-4' : 'flex-1 min-h-[100px]'
                )}>
                    <EditorContent editor={editor} className="text-text-primary" />
                    {showDebug && editor && <DebugPanel editor={editor} />}
                </div>
            </div>
        </VideoRefContext.Provider>
    )
}
