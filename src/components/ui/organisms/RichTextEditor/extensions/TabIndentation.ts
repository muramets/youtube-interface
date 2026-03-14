import { Extension } from '@tiptap/react'

/**
 * Tab Indentation Extension for Tiptap
 *
 * Enables Tab/Shift+Tab keyboard shortcuts for list indentation.
 *
 * Business Logic:
 * - Tab attempts structural nesting first (sinkListItem)
 * - If nesting fails (e.g., first item in list), falls back to visual indentation
 * - Visual indentation uses margin-left attribute (see IndentedListItem)
 * - Shift+Tab removes visual indentation first, then attempts structural lift
 * - This provides a smooth UX for both nested and non-nested list items
 */
export const TabIndentation = Extension.create({
    name: 'tabIndentation',

    addKeyboardShortcuts() {
        return {
            /**
             * Tab Key Handler
             *
             * Strategy:
             * 1. Try structural indentation (nest the list item)
             * 2. If that fails, apply visual indentation (margin-left)
             * 3. Always capture Tab to prevent focus loss
             */
            'Tab': () => {
                // 1. Try structural indentation (nesting)
                if (this.editor.commands.sinkListItem('listItem')) {
                    return true
                }

                // 2. Fallback: Visual Indentation (margin)
                const { selection } = this.editor.state
                const { $from } = selection
                const listItem = $from.node($from.depth - 1) // Get the list item node

                if (listItem && listItem.type.name === 'listItem') {
                    const currentIndent = listItem.attrs.indent || 0
                    return this.editor.commands.setIndent(currentIndent + 1)
                }

                return true // Capture Tab anyway to prevent focus loss
            },

            /**
             * Shift+Tab Key Handler
             *
             * Strategy:
             * 1. Check for visual indentation first and remove it
             * 2. If no visual indentation, try structural lift (un-nest)
             */
            'Shift-Tab': () => {
                // 1. Check for Visual Indentation first
                const { selection } = this.editor.state
                const { $from } = selection
                const listItem = $from.node($from.depth - 1)

                if (listItem && listItem.type.name === 'listItem' && listItem.attrs.indent > 0) {
                    return this.editor.commands.setIndent(listItem.attrs.indent - 1)
                }

                // 2. Fallback: Structural Lift (un-nest)
                return this.editor.commands.liftListItem('listItem')
            },
        }
    },
})
