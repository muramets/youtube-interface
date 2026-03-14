import { useEffect, useRef } from 'react'
import { Editor } from '@tiptap/react'
import TurndownService from 'turndown'
import { preprocessEmptyParagraphs } from '../utils/htmlProcessor'
import { parseMarkdownToHTML } from '../utils/markdownParser'

/**
 * Custom hook for synchronizing markdown value with editor HTML content.
 *
 * Handles bidirectional conversion:
 * - User types in editor -> HTML -> Markdown -> onChange callback
 * - External value changes -> Markdown -> HTML -> Editor content
 *
 * Business Logic:
 * - Prevents cursor jumps by tracking last emitted value
 * - Only updates editor when value changes externally (not from typing)
 * - Preprocesses HTML to preserve empty paragraphs
 * - Skips updates when editor is focused (user is typing)
 *
 * @param editor - Tiptap editor instance
 * @param value - Current markdown value from parent
 * @param onChange - Callback to emit markdown changes
 * @param turndownService - Configured Turndown service
 */
export function useMarkdownSync(
    editor: Editor | null,
    value: string,
    onChange: (value: string) => void,
    turndownService: TurndownService
): void {
    const lastValueRef = useRef(value)

    // Sync editor content when value changes externally (e.g., loaded from DB)
    useEffect(() => {
        if (!editor) return

        // Get current editor state as markdown
        const currentHTML = editor.getHTML()
        const currentMarkdown = turndownService.turndown(currentHTML)

        // Only update if value changed externally (not from our own onChange)
        if (value !== currentMarkdown && value !== lastValueRef.current) {
            // Convert incoming markdown to HTML
            const valueHTML = parseMarkdownToHTML(value)

            // Don't update while user is typing (prevents cursor jumps)
            if (!editor.isFocused) {
                editor.commands.setContent(valueHTML)
            }
        }
    }, [value, editor, turndownService])

    // Set up editor update handler
    useEffect(() => {
        if (!editor) return

        // This handler runs every time editor content changes
        const handleUpdate = () => {
            let html = editor.getHTML()

            // Preprocess HTML to preserve empty paragraphs
            // Injects Zero-Width Space (&#8203;) to prevent Turndown from stripping them
            html = preprocessEmptyParagraphs(html)

            // Convert HTML to Markdown
            const markdown = turndownService.turndown(html)

            // Only emit onChange if markdown actually changed
            // This prevents infinite loops and unnecessary re-renders
            if (markdown !== lastValueRef.current) {
                lastValueRef.current = markdown
                onChange(markdown)
            }
        }

        // Register the update handler
        editor.on('update', handleUpdate)

        // Cleanup on unmount
        return () => {
            editor.off('update', handleUpdate)
        }
    }, [editor, onChange, turndownService])
}
