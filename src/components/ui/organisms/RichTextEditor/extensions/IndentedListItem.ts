import ListItem from '@tiptap/extension-list-item'

declare module '@tiptap/core' {
    interface Commands<ReturnType> {
        indentedListItem: {
            setIndent: (indent: number) => ReturnType
        }
    }
}

export const IndentedListItem = ListItem.extend({
    addAttributes() {
        return {
            indent: {
                default: 0,
                parseHTML: element => {
                    // Parse margin-left like "1.5rem" or "24px"
                    const marginLeft = element.style.marginLeft
                    if (!marginLeft) return 0

                    // Assuming we use rem steps of 1.5rem (matches our editor spacing)
                    const value = parseFloat(marginLeft)
                    if (marginLeft.endsWith('rem')) {
                        return Math.round(value / 1.5)
                    }
                    // Fallback for px if needed (1.5rem = 24px usually)
                    return Math.round(value / 24)
                },
                renderHTML: attributes => {
                    if (attributes.indent === 0) {
                        return {}
                    }
                    return {
                        style: `margin-left: ${attributes.indent * 1.5}rem`
                    }
                },
            },
        }
    },

    addCommands() {
        return {
            ...this.parent?.(),
            setIndent: (indent: number) => ({ tr, state, dispatch }) => {
                const { selection } = state
                const { $from, $to } = selection

                // Find range covering selection
                const range = $from.blockRange($to, node => node.type.name === this.name)
                if (!range) return false

                if (dispatch) {
                    const { start, end } = range
                    state.doc.nodesBetween(start, end, (node, pos) => {
                        if (node.type.name === this.name) {
                            tr.setNodeMarkup(pos, undefined, {
                                ...node.attrs,
                                indent: indent
                            })
                        }
                    })
                }

                return true
            },
        }
    }
})
