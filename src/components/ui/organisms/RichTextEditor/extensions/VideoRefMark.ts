import { Mark } from '@tiptap/core'
import { ReactMarkViewRenderer } from '@tiptap/react'
import { VID_RE } from '../../../../../core/config/referencePatterns'
import { VideoRefView } from '../components/VideoRefView'

/**
 * VideoRefMark — Tiptap Mark extension for vid:// video references.
 *
 * Semantic mark (part of document model). Renders via React MarkView
 * with interactive tooltip. Replaces the old VideoIdHighlight decoration approach.
 *
 * Attributes:
 * - videoId: the video ID (YouTube 11-char or custom-*)
 * - title: display title for the link
 *
 * HTML roundtrip:
 * - parseHTML: matches <a href="vid://..."> tags
 * - renderHTML: outputs <a href="vid://..." data-video-ref="ID" class="video-reference-highlight">
 *
 * Mark behavior:
 * - inclusive: false — typing after mark does NOT extend it
 * - excludes: '' — allows bold/italic/color inside
 */
export const VideoRefMark = Mark.create({
    name: 'videoRef',

    inclusive: false,

    excludes: '',

    addAttributes() {
        return {
            videoId: {
                default: null,
                parseHTML: (el) => {
                    const href = (el as HTMLAnchorElement).getAttribute('href') ?? ''
                    const match = VID_RE.exec(href)
                    return match ? match[1] : null
                },
            },
            title: {
                default: null,
                parseHTML: (el) => el.textContent || null,
            },
        }
    },

    parseHTML() {
        return [
            {
                tag: 'a[href^="vid://"]',
            },
        ]
    },

    renderHTML({ HTMLAttributes }) {
        const videoId = HTMLAttributes.videoId as string
        return [
            'a',
            {
                href: `vid://${videoId}`,
                'data-video-ref': videoId,
                class: 'video-reference-highlight',
            },
            0,
        ]
    },

    addKeyboardShortcuts() {
        return {
            Backspace: ({ editor }) => {
                const { from, empty } = editor.state.selection
                if (!empty || from <= 1) return false

                const $pos = editor.state.doc.resolve(from)
                const nodeBefore = $pos.nodeBefore
                if (!nodeBefore?.isText) return false

                // Check if the text node before cursor has a videoRef mark
                const videoMark = nodeBefore.marks.find(m => m.type.name === 'videoRef')
                if (!videoMark) return false

                // Delete the entire marked text node
                const markStart = from - nodeBefore.nodeSize
                editor.chain().focus().deleteRange({ from: markStart, to: from }).run()
                return true
            },
        }
    },

    addMarkView() {
        return ReactMarkViewRenderer(VideoRefView)
    },
})
