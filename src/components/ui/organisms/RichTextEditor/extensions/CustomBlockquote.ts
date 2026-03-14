import Blockquote from '@tiptap/extension-blockquote'

declare module '@tiptap/core' {
    interface Commands<ReturnType> {
        customBlockquote: {
            setBlockquoteBorderColor: (color: string) => ReturnType
        }
    }
}

/**
 * Custom Blockquote Extension
 *
 * Extends the default Tiptap Blockquote to support custom border colors.
 *
 * Business Logic:
 * - Default border color is the theme's accent color (--accent)
 * - Border color can be customized using the existing color picker
 * - Color is stored as a data attribute and preserved in markdown
 */
export const CustomBlockquote = Blockquote.extend({
    addAttributes() {
        return {
            borderColor: {
                default: null, // null means use theme default (--accent)
                parseHTML: element => {
                    return element.getAttribute('data-border-color') || null
                },
                renderHTML: attributes => {
                    if (!attributes.borderColor) {
                        return {}
                    }
                    return {
                        'data-border-color': attributes.borderColor,
                        style: `border-left-color: ${attributes.borderColor}`
                    }
                },
            },
        }
    },

    addCommands() {
        return {
            ...this.parent?.(),
            setBlockquoteBorderColor: (color: string) => ({ tr, state, dispatch }) => {
                const { selection } = state
                const { $from } = selection

                // Find the blockquote node
                const blockquote = $from.node($from.depth)
                if (blockquote.type.name !== this.name) {
                    // Try to find blockquote in parent nodes
                    for (let i = $from.depth; i > 0; i--) {
                        const node = $from.node(i)
                        if (node.type.name === this.name) {
                            const pos = $from.before(i)
                            if (dispatch) {
                                tr.setNodeMarkup(pos, undefined, {
                                    ...node.attrs,
                                    borderColor: color
                                })
                            }
                            return true
                        }
                    }
                    return false
                }

                // Update the current blockquote
                const pos = $from.before($from.depth)
                if (dispatch) {
                    tr.setNodeMarkup(pos, undefined, {
                        ...blockquote.attrs,
                        borderColor: color
                    })
                }

                return true
            },
        }
    }
})
