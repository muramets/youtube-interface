// =============================================================================
// StickyNoteEditor — Slim TipTap WYSIWYG editor for sticky notes
// =============================================================================
//
// Replaces the plain <textarea> in edit mode. Content is stored as Markdown
// but rendered as rich text while editing. No toolbar — users write Markdown
// syntax directly and see it rendered in real time.
//
// Architecture (adapted from MonkeyLearn's RichTextEditor):
//   markdownParser.ts   — Markdown → HTML (on open)
//   useTurndownService  — HTML → Markdown (on change)
//   useMarkdownSync     — bidirectional sync without cursor jumps
// =============================================================================

import { useState, useEffect } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import { parseMarkdownToHTML } from './markdownParser';
import { useTurndownService } from './useTurndownService';
import { useMarkdownSync } from './useMarkdownSync';

interface StickyNoteEditorProps {
    /** Markdown content */
    value: string;
    /** Called with updated Markdown on every change */
    onChange: (markdown: string) => void;
    /** Called when editor loses focus */
    onBlur: () => void;
    /** Sticky note text color */
    textColor: string;
}

export const StickyNoteEditor: React.FC<StickyNoteEditorProps> = ({
    value,
    onChange,
    onBlur,
    textColor,
}) => {
    const turndownService = useTurndownService();

    // Parse initial Markdown → HTML once (avoids cursor jumps on re-render)
    const [initialContent] = useState(() => parseMarkdownToHTML(value));

    const editor = useEditor({
        extensions: [
            StarterKit.configure({
                heading: { levels: [1, 2, 3] },
            }),
            Placeholder.configure({
                placeholder: 'Write something…',
            }),
        ],
        content: initialContent,
        autofocus: 'end',
        editorProps: {
            attributes: {
                class: 'sticky-note-prose',
                style: [
                    `color: ${textColor}`,
                    'font-size: 13px',
                    'line-height: 1.5',
                    'outline: none',
                    'min-height: 20px',
                    'word-break: break-word',
                ].join('; '),
            },
        },
        onBlur: () => onBlur(),
    });

    // Bidirectional Markdown ↔ HTML sync
    useMarkdownSync(editor, value, onChange, turndownService);

    // Keep text color in sync when sticky note color changes mid-edit
    useEffect(() => {
        if (!editor) return;
        editor.setOptions({
            editorProps: {
                attributes: {
                    class: 'sticky-note-prose',
                    style: [
                        `color: ${textColor}`,
                        'font-size: 13px',
                        'line-height: 1.5',
                        'outline: none',
                        'min-height: 20px',
                        'word-break: break-word',
                    ].join('; '),
                },
            },
        });
    }, [editor, textColor]);

    return (
        <EditorContent
            editor={editor}
            style={{ width: '100%' }}
        />
    );
};
