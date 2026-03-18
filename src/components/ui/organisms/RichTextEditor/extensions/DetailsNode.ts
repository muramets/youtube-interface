import { Node, mergeAttributes } from '@tiptap/core'
import { TextSelection } from '@tiptap/pm/state'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import type { Node as PMNode } from '@tiptap/pm/model'
import type { ResolvedPos } from '@tiptap/pm/model'

declare module '@tiptap/core' {
    interface Commands<ReturnType> {
        details: {
            /** Wrap selection (or current block) in a details/spoiler block */
            setDetails: () => ReturnType
            /** Unwrap: extract content from the nearest details ancestor */
            unsetDetails: () => ReturnType
        }
    }
}

/**
 * Parents with content: 'block+' — a details node can replace any child here.
 * Not exhaustive but covers the common editing contexts.
 */
const BLOCK_CONTAINERS = new Set(['doc', 'detailsContent', 'blockquote', 'tableCell'])

/**
 * Find the nearest depth where a details node can be validly inserted.
 *
 * Walks up from the cursor position and checks each ancestor:
 * - Block containers (doc, blockquote, tableCell, detailsContent): always valid
 * - listItem (content: 'paragraph block*'): valid only if the node at this depth
 *   is NOT the first paragraph (details can be a subsequent block child)
 * - Everything else: keep climbing
 */
function findWrapDepth(resolved: ResolvedPos): number {
    for (let d = resolved.depth; d > 0; d--) {
        const parent = resolved.node(d - 1)
        const parentType = parent.type.name

        if (BLOCK_CONTAINERS.has(parentType)) {
            return d
        }

        // listItem: details is valid as a non-first child (after the required paragraph)
        if (parentType === 'listItem') {
            const nodeAtD = resolved.node(d)
            const isFirstParagraph = nodeAtD.type.name === 'paragraph' && parent.firstChild === nodeAtD
            if (!isFirstParagraph) {
                return d
            }
            // First paragraph of listItem — can't replace with details, keep climbing
        }
    }
    return 1
}

// =============================================================================
// Details — collapsible spoiler block
// Structure: details > detailsSummary + detailsContent
// Markdown: <details><summary>...</summary>...</details>
// =============================================================================

export const Details = Node.create({
    name: 'details',
    group: 'block',
    content: 'detailsSummary detailsContent',
    defining: true,

    addAttributes() {
        return {
            open: {
                default: true,
                parseHTML: (element: HTMLElement) => {
                    const dataOpen = element.getAttribute('data-open')
                    if (dataOpen !== null) return dataOpen === 'true'
                    // Native <details>: open attribute means expanded
                    return element.hasAttribute('open')
                },
                renderHTML: (attributes) => ({
                    'data-open': attributes.open ? 'true' : 'false',
                }),
            },
        }
    },

    parseHTML() {
        return [
            { tag: 'div[data-type="details"]' },
            { tag: 'details' },
        ]
    },

    renderHTML({ HTMLAttributes }) {
        return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'details' }), 0]
    },

    addCommands() {
        return {
            setDetails: () => ({ state, tr, dispatch }) => {
                const { selection, schema } = state
                const { $from, $to } = selection
                const detailsType = schema.nodes.details
                const summaryType = schema.nodes.detailsSummary
                const contentType = schema.nodes.detailsContent

                if (!detailsType || !summaryType || !contentType) return false

                const fromDepth = findWrapDepth($from)
                const toDepth = findWrapDepth($to)
                const startPos = $from.before(fromDepth)
                const endPos = $to.after(toDepth)

                // List context: split the list to wrap only the selected item(s),
                // not the entire list. bulletList/orderedList only accept listItem children,
                // so we can't replace a listItem with details — we must split.
                const fromNode = $from.node(fromDepth)
                const isList = fromNode.type.name === 'bulletList' || fromNode.type.name === 'orderedList'

                if (isList && fromDepth === toDepth && startPos === $to.before(toDepth)) {
                    const fromIdx = $from.index(fromDepth)
                    const toIdx = $to.index(fromDepth)

                    // Selected listItem(s) → wrapped in an inner list inside details
                    const selectedItems: PMNode[] = []
                    for (let i = fromIdx; i <= toIdx; i++) {
                        selectedItems.push(fromNode.child(i))
                    }

                    const innerList = fromNode.type.create(fromNode.attrs, selectedItems)
                    const summaryNode = summaryType.create()
                    const contentNode = contentType.create(null, innerList)
                    const detailsNode = detailsType.create({ open: true }, [summaryNode, contentNode])

                    // Build replacement: [items_before_list?, details, items_after_list?]
                    const result: PMNode[] = []

                    if (fromIdx > 0) {
                        const beforeItems: PMNode[] = []
                        for (let i = 0; i < fromIdx; i++) beforeItems.push(fromNode.child(i))
                        result.push(fromNode.type.create(fromNode.attrs, beforeItems))
                    }

                    result.push(detailsNode)

                    if (toIdx < fromNode.childCount - 1) {
                        const afterItems: PMNode[] = []
                        for (let i = toIdx + 1; i < fromNode.childCount; i++) afterItems.push(fromNode.child(i))
                        result.push(fromNode.type.create(fromNode.attrs, afterItems))
                    }

                    if (dispatch) {
                        tr.replaceWith(startPos, endPos, result)
                        let detailsStart = startPos
                        if (fromIdx > 0) detailsStart += result[0].nodeSize
                        tr.setSelection(TextSelection.create(tr.doc, detailsStart + 2))
                        dispatch(tr)
                    }
                    return true
                }

                // Standard wrap: replace the block range with a details node
                const selectedContent = state.doc.slice(startPos, endPos).content
                const summaryNode = summaryType.create()
                const contentNode = contentType.create(null, selectedContent)
                const detailsNode = detailsType.create({ open: true }, [summaryNode, contentNode])

                if (dispatch) {
                    tr.replaceWith(startPos, endPos, detailsNode)
                    // Cursor inside summary: details open (pos) + summary open (+1) + text start (+1)
                    tr.setSelection(TextSelection.create(tr.doc, startPos + 2))
                    dispatch(tr)
                }
                return true
            },

            unsetDetails: () => ({ state, tr, dispatch }) => {
                const { selection, schema } = state
                const { $from } = selection

                for (let depth = $from.depth; depth > 0; depth--) {
                    const node = $from.node(depth)
                    if (node.type.name !== 'details') continue

                    const pos = $from.before(depth)
                    const end = $from.after(depth)
                    const summaryChild = node.firstChild!
                    const contentChild = node.child(1)

                    const blocks: PMNode[] = []

                    // Preserve summary text as a paragraph if non-empty
                    if (summaryChild.content.size > 0) {
                        blocks.push(schema.nodes.paragraph.create(null, summaryChild.content))
                    }

                    contentChild.forEach(child => blocks.push(child))

                    if (blocks.length === 0) {
                        blocks.push(schema.nodes.paragraph.create())
                    }

                    if (dispatch) {
                        tr.replaceWith(pos, end, blocks)
                        dispatch(tr)
                    }
                    return true
                }
                return false
            },
        }
    },

    addKeyboardShortcuts() {
        return {
            // Backspace at start of empty summary → unwrap the entire details block
            Backspace: ({ editor }) => {
                const { state } = editor
                const { $from, empty } = state.selection

                if (!empty) return false
                if ($from.parent.type.name !== 'detailsSummary') return false
                if ($from.parentOffset !== 0) return false
                if ($from.parent.content.size > 0) return false

                return editor.commands.unsetDetails()
            },

            // Alt+ArrowUp — move details block up among siblings
            'Alt-ArrowUp': ({ editor }) => {
                const { state } = editor
                const { $from } = state.selection

                for (let d = $from.depth; d > 0; d--) {
                    if ($from.node(d).type.name !== 'details') continue

                    const parentDepth = d - 1
                    const parent = $from.node(parentDepth)
                    const idx = $from.index(parentDepth)

                    if (idx === 0) return false
                    // Don't move above listItem's required first paragraph
                    if (idx === 1 && parent.type.name === 'listItem') return false

                    const detailsNode = $from.node(d)
                    const detailsPos = $from.before(d)
                    const detailsEnd = $from.after(d)
                    const prevNode = parent.child(idx - 1)
                    const prevStart = detailsPos - prevNode.nodeSize

                    const { tr } = state
                    tr.replaceWith(prevStart, detailsEnd, [detailsNode, prevNode])
                    tr.setSelection(TextSelection.create(tr.doc, prevStart + 2))
                    editor.view.dispatch(tr)
                    return true
                }
                return false
            },

            // Alt+ArrowDown — move details block down among siblings
            'Alt-ArrowDown': ({ editor }) => {
                const { state } = editor
                const { $from } = state.selection

                for (let d = $from.depth; d > 0; d--) {
                    if ($from.node(d).type.name !== 'details') continue

                    const parentDepth = d - 1
                    const parent = $from.node(parentDepth)
                    const idx = $from.index(parentDepth)

                    if (idx >= parent.childCount - 1) return false

                    const detailsNode = $from.node(d)
                    const detailsPos = $from.before(d)
                    const detailsEnd = $from.after(d)
                    const nextNode = parent.child(idx + 1)
                    const nextEnd = detailsEnd + nextNode.nodeSize

                    const { tr } = state
                    tr.replaceWith(detailsPos, nextEnd, [nextNode, detailsNode])
                    const newDetailsPos = detailsPos + nextNode.nodeSize
                    tr.setSelection(TextSelection.create(tr.doc, newDetailsPos + 2))
                    editor.view.dispatch(tr)
                    return true
                }
                return false
            },
        }
    },

    addProseMirrorPlugins() {
        return [
            new Plugin({
                key: new PluginKey('detailsToggle'),
                props: {
                    decorations: (state) => {
                        const decorations: Decoration[] = []

                        state.doc.descendants((node, pos) => {
                            if (node.type.name !== 'details') return

                            const isOpen = node.attrs.open !== false
                            const summaryNode = node.firstChild
                            if (!summaryNode) return

                            // Chevron toggle widget at the start of summary text
                            decorations.push(
                                Decoration.widget(pos + 2, (view) => {
                                    const icon = document.createElement('span')
                                    icon.className = `details-toggle-icon${isOpen ? '' : ' details-toggle-closed'}`
                                    icon.contentEditable = 'false'
                                    icon.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>'

                                    icon.onmousedown = (e) => {
                                        e.preventDefault()
                                        e.stopPropagation()
                                    }

                                    icon.onclick = (e) => {
                                        e.preventDefault()
                                        e.stopPropagation()
                                        const { tr } = view.state
                                        tr.setNodeMarkup(pos, undefined, { ...node.attrs, open: !isOpen })
                                        view.dispatch(tr)
                                    }

                                    return icon
                                }, { side: -1 })
                            )

                            // When collapsed, hide the content node
                            if (!isOpen) {
                                const contentPos = pos + 1 + summaryNode.nodeSize
                                const contentChild = node.child(1)
                                decorations.push(
                                    Decoration.node(contentPos, contentPos + contentChild.nodeSize, {
                                        style: 'display: none !important',
                                    })
                                )
                            }
                        })

                        return DecorationSet.create(state.doc, decorations)
                    },
                },
            }),
        ]
    },
})

// =============================================================================
// DetailsSummary — the visible title line of the spoiler
// =============================================================================

export const DetailsSummary = Node.create({
    name: 'detailsSummary',
    content: 'inline*',
    defining: true,
    selectable: false,

    parseHTML() {
        return [
            { tag: 'div[data-type="details-summary"]' },
            { tag: 'summary' },
        ]
    },

    renderHTML({ HTMLAttributes }) {
        return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'details-summary' }), 0]
    },

    addKeyboardShortcuts() {
        return {
            // Enter in summary → move cursor to the content area
            Enter: ({ editor }) => {
                const { state } = editor
                const { $from } = state.selection

                if ($from.parent.type.name !== 'detailsSummary') return false

                const detailsDepth = $from.depth - 1
                const detailsNode = $from.node(detailsDepth)
                if (detailsNode.type.name !== 'details') return false

                const detailsPos = $from.before(detailsDepth)
                const summarySize = detailsNode.firstChild!.nodeSize
                // Content position: details open + summary + content open + first block open
                const cursorPos = detailsPos + 1 + summarySize + 2

                const chain = editor.chain()

                // Expand if collapsed
                if (!detailsNode.attrs.open) {
                    chain.command(({ tr }) => {
                        tr.setNodeMarkup(detailsPos, undefined, { ...detailsNode.attrs, open: true })
                        return true
                    })
                }

                return chain.setTextSelection(cursorPos).scrollIntoView().run()
            },
        }
    },
})

// =============================================================================
// DetailsContent — the collapsible body of the spoiler
// =============================================================================

export const DetailsContent = Node.create({
    name: 'detailsContent',
    content: 'block+',
    defining: true,

    parseHTML() {
        return [
            { tag: 'div[data-type="details-content"]' },
        ]
    },

    renderHTML({ HTMLAttributes }) {
        return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'details-content' }), 0]
    },

    addKeyboardShortcuts() {
        return {
            // Enter on empty last paragraph → escape out of details
            Enter: ({ editor }) => {
                const { state } = editor
                const { $from, empty } = state.selection

                if (!empty) return false
                if ($from.parent.type.name !== 'paragraph') return false
                if ($from.parent.content.size > 0) return false

                // Find detailsContent ancestor
                let contentDepth = -1
                for (let d = $from.depth; d > 0; d--) {
                    if ($from.node(d).type.name === 'detailsContent') {
                        contentDepth = d
                        break
                    }
                }
                if (contentDepth === -1) return false

                const contentNode = $from.node(contentDepth)

                // Only escape if this is the last child
                if (contentNode.lastChild !== $from.parent) return false

                const detailsDepth = contentDepth - 1
                if ($from.node(detailsDepth).type.name !== 'details') return false

                const detailsEndPos = $from.after(detailsDepth)
                const emptyParaStart = $from.before($from.depth)
                const emptyParaEnd = $from.after($from.depth)

                const { tr, schema } = state

                if (contentNode.childCount > 1) {
                    // Remove empty paragraph, insert new one after details
                    tr.delete(emptyParaStart, emptyParaEnd)
                    const adjustedEnd = detailsEndPos - (emptyParaEnd - emptyParaStart)
                    tr.insert(adjustedEnd, schema.nodes.paragraph.create())
                    tr.setSelection(TextSelection.create(tr.doc, adjustedEnd + 1))
                } else {
                    // Only child — just insert after details
                    tr.insert(detailsEndPos, schema.nodes.paragraph.create())
                    tr.setSelection(TextSelection.create(tr.doc, detailsEndPos + 1))
                }

                editor.view.dispatch(tr)
                return true
            },
        }
    },
})
