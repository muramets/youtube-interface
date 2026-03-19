import { Mark } from '@tiptap/core'
import { ReactMarkViewRenderer } from '@tiptap/react'
import { KI_RE } from '../../../../../core/config/referencePatterns'
import { KiRefView } from '../components/KiRefView'

/**
 * KiRefMark — Tiptap Mark extension for ki:// Knowledge Item references.
 *
 * Semantic mark (part of document model). Renders via React MarkView
 * with interactive tooltip showing KI metadata (title, category, summary).
 *
 * Attributes:
 * - kiId: the Knowledge Item Firestore document ID
 * - title: display title for the link
 *
 * HTML roundtrip:
 * - parseHTML: matches <a href="ki://..."> tags
 * - renderHTML: outputs <a href="ki://..." data-ki-ref="ID" class="ki-reference-highlight">
 *
 * Mark behavior:
 * - inclusive: false — typing after mark does NOT extend it
 * - excludes: '' — allows bold/italic/color inside
 */
export const KiRefMark = Mark.create({
    name: 'kiRef',

    inclusive: false,

    excludes: '',

    addAttributes() {
        return {
            kiId: {
                default: null,
                parseHTML: (el) => {
                    const href = (el as HTMLAnchorElement).getAttribute('href') ?? ''
                    const match = KI_RE.exec(href)
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
                tag: 'a[href^="ki://"]',
            },
        ]
    },

    renderHTML({ HTMLAttributes }) {
        const kiId = HTMLAttributes.kiId as string
        return [
            'a',
            {
                href: `ki://${kiId}`,
                'data-ki-ref': kiId,
                class: 'ki-reference-highlight',
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

                const kiMark = nodeBefore.marks.find(m => m.type.name === 'kiRef')
                if (!kiMark) return false

                // Delete the entire marked text node
                const markStart = from - nodeBefore.nodeSize
                editor.chain().focus().deleteRange({ from: markStart, to: from }).run()
                return true
            },
        }
    },

    addMarkView() {
        return ReactMarkViewRenderer(KiRefView)
    },
})
