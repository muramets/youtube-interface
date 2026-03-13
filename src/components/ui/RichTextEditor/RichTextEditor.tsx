// =============================================================================
// RichTextEditor — Tiptap WYSIWYG editor with Markdown I/O
//
// Content is stored as Markdown. On mount, Markdown → HTML via `marked`.
// On every change, HTML → Markdown via `turndown`.
// Adapted from StickyNoteEditor pattern with toolbar + extended extensions.
// =============================================================================

import { useState, useCallback } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import { Table } from '@tiptap/extension-table';
import { TableRow } from '@tiptap/extension-table-row';
import { TableCell } from '@tiptap/extension-table-cell';
import { TableHeader } from '@tiptap/extension-table-header';
import { TextAlign } from '@tiptap/extension-text-align';
import TurndownService from 'turndown';
import { marked } from 'marked';
import {
    Bold, Italic, Strikethrough, Code, Heading1, Heading2, Heading3,
    List, ListOrdered, Quote, Minus, Undo, Redo,
} from 'lucide-react';

// =============================================================================
// Markdown conversion utilities
// =============================================================================

function parseMarkdownToHTML(markdown: string): string {
    if (!markdown) return '';
    return marked.parse(markdown, { async: false, gfm: true, breaks: true }) as string;
}

function createTurndown(): TurndownService {
    const service = new TurndownService({
        headingStyle: 'atx',
        codeBlockStyle: 'fenced',
    });
    service.keep(['span', 'br']);

    // Empty-paragraph rule: preserve blank lines
    service.addRule('empty-paragraph', {
        filter(node) {
            return (
                node.nodeName === 'P' &&
                (
                    node.innerHTML.trim() === '' ||
                    node.innerHTML === '<br>' ||
                    node.textContent?.trim() === '' ||
                    (node.childNodes.length === 1 && node.firstChild?.nodeName === 'BR')
                )
            );
        },
        replacement() {
            return '&nbsp;\n\n';
        },
    });

    return service;
}

// =============================================================================
// Component
// =============================================================================

interface RichTextEditorProps {
    /** Markdown content */
    value: string;
    /** Called with updated Markdown on every change */
    onChange: (markdown: string) => void;
    /** Placeholder text shown when editor is empty */
    placeholder?: string;
    /** Minimum height in px */
    minHeight?: number;
    /** Disable editing */
    readOnly?: boolean;
}

export const RichTextEditor: React.FC<RichTextEditorProps> = ({
    value,
    onChange,
    placeholder = 'Start writing...',
    minHeight = 200,
    readOnly = false,
}) => {
    const [turndownService] = useState(() => createTurndown());
    const [initialContent] = useState(() => parseMarkdownToHTML(value));

    const handleUpdate = useCallback(({ editor }: { editor: { getHTML: () => string } }) => {
        const html = editor.getHTML();
        const md = turndownService.turndown(html);
        onChange(md);
    }, [onChange, turndownService]);

    const editor = useEditor({
        extensions: [
            StarterKit.configure({
                heading: { levels: [1, 2, 3] },
            }),
            Placeholder.configure({ placeholder }),
            Table.configure({ resizable: false }),
            TableRow,
            TableCell,
            TableHeader,
            TextAlign.configure({ types: ['heading', 'paragraph'] }),
        ],
        content: initialContent,
        editable: !readOnly,
        onUpdate: handleUpdate,
    });

    if (!editor) return null;

    return (
        <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-primary)] overflow-hidden">
            {/* Toolbar */}
            {!readOnly && (
                <div className="flex flex-wrap items-center gap-0.5 p-1.5 border-b border-[var(--color-border)] bg-[var(--color-bg-secondary)]">
                    <ToolbarButton
                        onClick={() => editor.chain().focus().toggleBold().run()}
                        active={editor.isActive('bold')}
                        title="Bold"
                    >
                        <Bold size={16} />
                    </ToolbarButton>
                    <ToolbarButton
                        onClick={() => editor.chain().focus().toggleItalic().run()}
                        active={editor.isActive('italic')}
                        title="Italic"
                    >
                        <Italic size={16} />
                    </ToolbarButton>
                    <ToolbarButton
                        onClick={() => editor.chain().focus().toggleStrike().run()}
                        active={editor.isActive('strike')}
                        title="Strikethrough"
                    >
                        <Strikethrough size={16} />
                    </ToolbarButton>
                    <ToolbarButton
                        onClick={() => editor.chain().focus().toggleCode().run()}
                        active={editor.isActive('code')}
                        title="Inline Code"
                    >
                        <Code size={16} />
                    </ToolbarButton>

                    <ToolbarDivider />

                    <ToolbarButton
                        onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
                        active={editor.isActive('heading', { level: 1 })}
                        title="Heading 1"
                    >
                        <Heading1 size={16} />
                    </ToolbarButton>
                    <ToolbarButton
                        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
                        active={editor.isActive('heading', { level: 2 })}
                        title="Heading 2"
                    >
                        <Heading2 size={16} />
                    </ToolbarButton>
                    <ToolbarButton
                        onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
                        active={editor.isActive('heading', { level: 3 })}
                        title="Heading 3"
                    >
                        <Heading3 size={16} />
                    </ToolbarButton>

                    <ToolbarDivider />

                    <ToolbarButton
                        onClick={() => editor.chain().focus().toggleBulletList().run()}
                        active={editor.isActive('bulletList')}
                        title="Bullet List"
                    >
                        <List size={16} />
                    </ToolbarButton>
                    <ToolbarButton
                        onClick={() => editor.chain().focus().toggleOrderedList().run()}
                        active={editor.isActive('orderedList')}
                        title="Ordered List"
                    >
                        <ListOrdered size={16} />
                    </ToolbarButton>
                    <ToolbarButton
                        onClick={() => editor.chain().focus().toggleBlockquote().run()}
                        active={editor.isActive('blockquote')}
                        title="Blockquote"
                    >
                        <Quote size={16} />
                    </ToolbarButton>
                    <ToolbarButton
                        onClick={() => editor.chain().focus().setHorizontalRule().run()}
                        title="Horizontal Rule"
                    >
                        <Minus size={16} />
                    </ToolbarButton>

                    <ToolbarDivider />

                    <ToolbarButton
                        onClick={() => editor.chain().focus().undo().run()}
                        disabled={!editor.can().undo()}
                        title="Undo"
                    >
                        <Undo size={16} />
                    </ToolbarButton>
                    <ToolbarButton
                        onClick={() => editor.chain().focus().redo().run()}
                        disabled={!editor.can().redo()}
                        title="Redo"
                    >
                        <Redo size={16} />
                    </ToolbarButton>
                </div>
            )}

            {/* Editor content */}
            <EditorContent
                editor={editor}
                className="prose prose-sm dark:prose-invert max-w-none p-4 focus-within:outline-none [&_.tiptap]:outline-none [&_.tiptap_p.is-editor-empty:first-child::before]:text-[var(--color-text-tertiary)] [&_.tiptap_p.is-editor-empty:first-child::before]:content-[attr(data-placeholder)] [&_.tiptap_p.is-editor-empty:first-child::before]:float-left [&_.tiptap_p.is-editor-empty:first-child::before]:h-0 [&_.tiptap_p.is-editor-empty:first-child::before]:pointer-events-none"
                style={{ minHeight }}
            />
        </div>
    );
};

// =============================================================================
// Toolbar subcomponents
// =============================================================================

interface ToolbarButtonProps {
    onClick: () => void;
    active?: boolean;
    disabled?: boolean;
    title?: string;
    children: React.ReactNode;
}

const ToolbarButton: React.FC<ToolbarButtonProps> = ({ onClick, active, disabled, title, children }) => (
    <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        title={title}
        className={`
            p-1.5 rounded transition-colors
            ${active
                ? 'bg-[var(--color-accent)] text-white'
                : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-tertiary)] hover:text-[var(--color-text-primary)]'
            }
            ${disabled ? 'opacity-30 cursor-not-allowed' : 'cursor-pointer'}
        `}
    >
        {children}
    </button>
);

const ToolbarDivider: React.FC = () => (
    <div className="w-px h-5 bg-[var(--color-border)] mx-1" />
);
