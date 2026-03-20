import { Extension } from '@tiptap/react'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import clsx from 'clsx'

// Custom extension for collapsable headers
export const CollapsableHeadings = Extension.create({
    name: 'collapsableHeadings',

    addOptions() {
        return {
            levels: [1, 2, 3, 4, 5, 6],
            /** Headings at this level and above are collapsed by default (4 = h4+ collapsed) */
            defaultCollapsedLevel: 4,
        }
    },

    addGlobalAttributes() {
        return [
            {
                types: ['heading'],
                attributes: {
                    collapsed: {
                        default: null,
                        parseHTML: element => {
                            const attr = element.getAttribute('data-collapsed')
                            if (attr === 'true') return true
                            if (attr === 'false') return false
                            return null
                        },
                        renderHTML: attributes => {
                            if (attributes.collapsed === true) {
                                return { 'data-collapsed': 'true' }
                            }
                            if (attributes.collapsed === false) {
                                return { 'data-collapsed': 'false' }
                            }
                            return {}
                        },
                    },
                },
            },
        ]
    },

    addKeyboardShortcuts() {
        return {
            'Enter': ({ editor }) => {
                const { state } = editor
                const { selection } = state
                const { $from, empty } = selection

                if (!empty) return false

                const node = $from.parent

                // 1. Check for "Collapsed Header Entrapment"
                // Determine if this header IS collapsed (explicit or implicit)
                const isCollapsed = node.attrs.collapsed === true || (node.attrs.collapsed === null && node.attrs.level >= this.options.defaultCollapsedLevel)

                if (node.type.name === 'heading' && isCollapsed && $from.parentOffset === node.content.size) {
                    const currentLevel = node.attrs.level
                    let insertPos = state.doc.content.size // Default to end of doc

                    // Search for the next heading of same or higher level to define insertion point
                    state.doc.nodesBetween($from.pos + 1, state.doc.content.size, (n, pos) => {
                        if (insertPos < state.doc.content.size) return false // Already found

                        if (n.type.name === 'heading' && n.attrs.level <= currentLevel) {
                            insertPos = pos
                            return false
                        }
                        return true
                    })

                    return editor.chain()
                        .insertContentAt(insertPos, {
                            type: 'heading',
                            attrs: { level: currentLevel }
                        })
                        .setTextSelection(insertPos + 1)
                        .scrollIntoView()
                        .run()
                }

                // 2. Headings: Hierarchy Climbing on Enter
                if (node.content.size === 0 && node.type.name === 'heading') {
                    const level = node.attrs.level
                    if (level > 1) {
                        return editor.commands.setNode('heading', { level: level - 1 })
                    } else {
                        return editor.commands.setNode('paragraph')
                    }
                }

                return false // Standard behavior
            },

            'Backspace': ({ editor }) => {
                const { state } = editor
                const { selection } = state
                const { $from, empty } = selection

                if (!empty) return false
                const node = $from.parent

                // 1. Handle Bullet Lists
                if (node.content.size === 0 && $from.node($from.depth - 1)?.type.name === 'listItem') {
                    return editor.commands.liftListItem('listItem')
                }

                return false
            }
        }
    },

    addProseMirrorPlugins() {
        const defaultCollapsedLevel = this.options.defaultCollapsedLevel
        return [
            new Plugin({
                key: new PluginKey('collapsableHeadings'),
                props: {
                    decorations: (state) => {
                        const decorations: Decoration[] = []
                        const { doc } = state

                        let collapsedLevel: number | null = null
                        let currentDepth: number = 0

                        doc.descendants((node, pos, parent) => {
                            const isTopLevel = parent === doc

                            if (node.type.name === 'heading') {
                                const level = node.attrs.level
                                currentDepth = level

                                // Check if this new header breaks out of the current collapsed section
                                if (collapsedLevel !== null && level <= collapsedLevel) {
                                    collapsedLevel = null
                                }

                                if (collapsedLevel !== null) {
                                    // Hidden
                                    decorations.push(
                                        Decoration.node(pos, pos + node.nodeSize, {
                                            class: 'collapsed-content',
                                            style: 'display: none !important'
                                        })
                                    )
                                } else {
                                    // Determine if this header IS collapsed
                                    const isCollapsed = node.attrs.collapsed === true || (node.attrs.collapsed === null && level >= defaultCollapsedLevel)

                                    if (isCollapsed) {
                                        collapsedLevel = level
                                    }

                                    const nodeAttrs: Record<string, string> = {
                                        'data-level': `${level}`
                                    }

                                    if (isTopLevel) {
                                        nodeAttrs.class = `depth-${level}`
                                    }

                                    decorations.push(
                                        Decoration.node(pos, pos + node.nodeSize, nodeAttrs),
                                        Decoration.widget(pos + 1, (view) => {
                                            const icon = document.createElement('span')
                                            const leftOffset = (level - 1) * 1.5;

                                            icon.className = clsx(
                                                "absolute flex items-center justify-center w-5 h-[1.3em] cursor-pointer transition-all duration-200 text-text-secondary hover:text-text-primary z-10",
                                                "top-0",
                                                isCollapsed ? "-rotate-90" : "rotate-0"
                                            )
                                            icon.style.left = `${leftOffset}rem`
                                            icon.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>`

                                            icon.onmousedown = (e) => {
                                                e.preventDefault()
                                                e.stopPropagation()
                                            }

                                            icon.onclick = (e) => {
                                                e.preventDefault()
                                                e.stopPropagation()
                                                const { tr } = view.state
                                                // Toggle logic: If currently technically collapsed (explicit or implicit), set explicit false. Else explicit true.
                                                const currentlyCollapsed = node.attrs.collapsed === true || (node.attrs.collapsed === null && level >= defaultCollapsedLevel)

                                                tr.setNodeMarkup(pos, undefined, {
                                                    ...node.attrs,
                                                    collapsed: !currentlyCollapsed
                                                })
                                                view.dispatch(tr)
                                            }
                                            return icon
                                        }, { side: -1 })
                                    )
                                }
                            } else {
                                // Content
                                if (collapsedLevel !== null) {
                                    decorations.push(
                                        Decoration.node(pos, pos + node.nodeSize, {
                                            class: 'collapsed-content',
                                            style: 'display: none !important'
                                        })
                                    )
                                } else if (currentDepth > 0 && isTopLevel) {
                                    decorations.push(
                                        Decoration.node(pos, pos + node.nodeSize, {
                                            class: `depth-${currentDepth}`
                                        })
                                    )
                                }
                            }
                        })

                        return DecorationSet.create(doc, decorations)
                    },
                },
            }),
        ]
    },
})
