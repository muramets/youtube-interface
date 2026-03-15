/**
 * VideoIdHighlight — Tiptap extension that highlights video IDs in the editor.
 *
 * Uses ProseMirror Decorations (non-destructive — doesn't modify the document).
 * Scans text nodes for video IDs from the provided Set, applies inline
 * decorations with the `video-reference-highlight` CSS class.
 *
 * Usage:
 *   VideoIdHighlight.configure({ videoIds: new Set(['A4SkhlJ2mK8', 'custom-123']) })
 */
import { Extension } from '@tiptap/react'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'

const pluginKey = new PluginKey('videoIdHighlight')

export interface VideoIdHighlightOptions {
    /** Set of video IDs to highlight. Update via extension reconfiguration. */
    videoIds: Set<string>
}

/**
 * Build a regex that matches any of the provided video IDs as whole words.
 * Returns null if no IDs provided.
 */
function buildPattern(ids: Set<string>): RegExp | null {
    if (ids.size === 0) return null
    // Sort by length descending (longer IDs first to avoid partial matches)
    const sorted = [...ids].sort((a, b) => b.length - a.length)
    const escaped = sorted.map(id => id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    return new RegExp(`(?<![\\w/-])(${escaped.join('|')})(?![\\w/-])`, 'g')
}

/**
 * Scan the document and create decorations for all video ID matches.
 */
function buildDecorations(doc: { descendants: (fn: (node: { isText: boolean; text?: string }, pos: number) => void) => void }, pattern: RegExp): DecorationSet {
    const decorations: Decoration[] = []

    doc.descendants((node, pos) => {
        if (!node.isText || !node.text) return

        pattern.lastIndex = 0
        let match: RegExpExecArray | null
        while ((match = pattern.exec(node.text)) !== null) {
            const from = pos + match.index
            const to = from + match[0].length
            decorations.push(
                Decoration.inline(from, to, {
                    class: 'video-reference-highlight',
                    style: 'cursor: default;',
                })
            )
        }
    })

    return DecorationSet.create(doc as Parameters<typeof DecorationSet.create>[0], decorations)
}

export const VideoIdHighlight = Extension.create<VideoIdHighlightOptions>({
    name: 'videoIdHighlight',

    addOptions() {
        return {
            videoIds: new Set<string>(),
        }
    },

    addProseMirrorPlugins() {
        const { videoIds } = this.options

        return [
            new Plugin({
                key: pluginKey,
                state: {
                    init(_, { doc }) {
                        const pattern = buildPattern(videoIds)
                        if (!pattern) return DecorationSet.empty
                        return buildDecorations(doc, pattern)
                    },
                    apply(tr, oldSet) {
                        if (!tr.docChanged) return oldSet
                        const pattern = buildPattern(videoIds)
                        if (!pattern) return DecorationSet.empty
                        return buildDecorations(tr.doc, pattern)
                    },
                },
                props: {
                    decorations(state) {
                        return pluginKey.getState(state)
                    },
                },
            }),
        ]
    },
})
