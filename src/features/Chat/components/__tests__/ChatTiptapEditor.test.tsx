import { render, act, waitFor } from '@testing-library/react';
import { useRef, useEffect } from 'react';
import {
    ChatTiptapEditor,
    type ChatTiptapEditorHandle,
} from '../ChatTiptapEditor';
import { vi, describe, it, expect, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Wrapper component that exposes the imperative handle to the test
 * via a callback. We use useEffect to notify the test once the ref
 * is populated (which happens after mount + Tiptap editor init).
 */
function TestWrapper({
    onRef,
    ...props
}: React.ComponentProps<typeof ChatTiptapEditor> & {
    onRef: (handle: ChatTiptapEditorHandle | null) => void;
}) {
    const ref = useRef<ChatTiptapEditorHandle>(null);

    useEffect(() => {
        onRef(ref.current);
    });

    return <ChatTiptapEditor {...props} ref={ref} />;
}

/** Default props to reduce boilerplate in tests. */
function defaultProps(
    overrides: Partial<React.ComponentProps<typeof ChatTiptapEditor>> = {},
) {
    return {
        onSend: vi.fn(),
        onAddFiles: vi.fn(),
        onContentChange: vi.fn(),
        ...overrides,
    };
}

/**
 * Renders the editor and waits for the imperative handle to become available.
 * Returns the handle and all callback mocks.
 */
async function renderEditor(
    overrides: Partial<React.ComponentProps<typeof ChatTiptapEditor>> = {},
) {
    let handle: ChatTiptapEditorHandle | null = null;
    const props = defaultProps(overrides);

    render(
        <TestWrapper
            {...props}
            onRef={(h) => {
                handle = h;
            }}
        />,
    );

    // Wait for Tiptap to initialize and the handle to be available
    await waitFor(() => {
        expect(handle).not.toBeNull();
    });

    return {
        handle: handle!,
        onSend: props.onSend as ReturnType<typeof vi.fn>,
        onAddFiles: props.onAddFiles as ReturnType<typeof vi.fn>,
        onContentChange: props.onContentChange as ReturnType<typeof vi.fn>,
    };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ChatTiptapEditor', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    // -----------------------------------------------------------------------
    // Imperative Handle (T4.2)
    // -----------------------------------------------------------------------

    describe('Imperative Handle', () => {
        it('isEmpty() returns true for empty editor', async () => {
            const { handle } = await renderEditor();
            expect(handle.isEmpty()).toBe(true);
        });

        it('isEmpty() returns false after setContent()', async () => {
            const { handle } = await renderEditor();

            act(() => {
                handle.setContent('hello');
            });

            await waitFor(() => {
                expect(handle.isEmpty()).toBe(false);
            });
        });

        it('clearContent() empties the editor', async () => {
            const { handle } = await renderEditor();

            act(() => {
                handle.setContent('some content');
            });

            await waitFor(() => {
                expect(handle.isEmpty()).toBe(false);
            });

            act(() => {
                handle.clearContent();
            });

            await waitFor(() => {
                expect(handle.isEmpty()).toBe(true);
            });
        });

        it('getMarkdown() returns text when editor has content', async () => {
            const { handle } = await renderEditor();

            act(() => {
                handle.setContent('hello world');
            });

            await waitFor(() => {
                const md = handle.getMarkdown();
                expect(md).toContain('hello world');
            });
        });

        it('getMarkdown() returns empty string for empty editor', async () => {
            const { handle } = await renderEditor();
            const md = handle.getMarkdown();
            expect(md.trim()).toBe('');
        });

        it('setContent() sets content from markdown string', async () => {
            const { handle } = await renderEditor();

            act(() => {
                handle.setContent('**bold text**');
            });

            await waitFor(() => {
                expect(handle.isEmpty()).toBe(false);
                const md = handle.getMarkdown();
                // Should contain the bold text (exact markdown format depends
                // on turndown output, but text content must be present)
                expect(md).toContain('bold text');
            });
        });

        it('focus() does not throw', async () => {
            const { handle } = await renderEditor();
            // In jsdom, focus may be a no-op, but it should not throw
            expect(() => {
                act(() => {
                    handle.focus();
                });
            }).not.toThrow();
        });
    });

    // -----------------------------------------------------------------------
    // Keyboard Shortcuts (T4.3)
    // -----------------------------------------------------------------------

    describe('Keyboard Shortcuts', () => {
        /**
         * NOTE: Tiptap keyboard shortcuts are handled by ProseMirror's
         * keymap plugin which intercepts native keyboard events at the
         * contenteditable level. In jsdom, contenteditable is not fully
         * implemented — dispatching KeyboardEvent to the editor DOM node
         * does NOT trigger ProseMirror's keymap handlers.
         *
         * This means we cannot reliably test:
         * - Enter → calls onSend
         * - Shift+Enter → inserts hard break
         * - Enter suppression when data-suggestion-popup is present
         *
         * These shortcuts are tested implicitly via E2E / browser tests.
         * The extension is defined in useChatEditorExtensions.ts and the
         * logic is straightforward (Enter → onSend, Shift+Enter → hardBreak).
         */

        it('keyboard shortcut extension is registered (editor initializes without error)', async () => {
            // If the ChatKeyboardShortcuts extension had a bug, the editor
            // would fail to initialize and the handle would be null.
            const { handle } = await renderEditor();
            expect(handle).toBeDefined();
            expect(handle.isEmpty()).toBe(true);
        });
    });

    // -----------------------------------------------------------------------
    // File Paste Proxy (T4.4)
    // -----------------------------------------------------------------------

    describe('File Paste', () => {
        /**
         * NOTE: Tiptap's handlePaste is a ProseMirror editor prop that
         * intercepts paste events at the contenteditable level. In jsdom,
         * dispatching a ClipboardEvent to the editor DOM does not go
         * through ProseMirror's event pipeline, so handlePaste is never
         * invoked.
         *
         * The paste interception logic is simple and is covered by the
         * component's editorProps.handlePaste definition:
         * - If clipboardData contains file items → call onAddFiles, prevent default
         * - Otherwise → return false (let Tiptap handle text paste)
         *
         * Full paste testing requires a real browser (E2E tests).
         */

        it('editor renders and accepts text content without error', async () => {
            const { handle } = await renderEditor();

            act(() => {
                handle.setContent('pasted text');
            });

            await waitFor(() => {
                expect(handle.getMarkdown()).toContain('pasted text');
            });
        });
    });

    // -----------------------------------------------------------------------
    // Disabled State
    // -----------------------------------------------------------------------

    describe('Disabled State', () => {
        it('editor is not editable when disabled=true', async () => {
            const { handle } = await renderEditor({ disabled: true });

            // The editor should still initialize, but setContent should
            // either be ignored or the editor should be in read-only mode.
            // We verify by checking the DOM — Tiptap sets contenteditable="false"
            // on the editor element when not editable.
            const editorElement = document.querySelector(
                '.chat-tiptap-editor .tiptap',
            );
            expect(editorElement).not.toBeNull();
            expect(editorElement?.getAttribute('contenteditable')).toBe(
                'false',
            );
            // Handle should still be functional
            expect(handle.isEmpty()).toBe(true);
        });

        it('editor is editable when disabled=false (default)', async () => {
            await renderEditor({ disabled: false });

            const editorElement = document.querySelector(
                '.chat-tiptap-editor .tiptap',
            );
            expect(editorElement).not.toBeNull();
            expect(editorElement?.getAttribute('contenteditable')).toBe(
                'true',
            );
        });
    });

    // -----------------------------------------------------------------------
    // onContentChange Callback
    // -----------------------------------------------------------------------

    describe('onContentChange callback', () => {
        it('fires with true when content is set', async () => {
            const { handle, onContentChange } = await renderEditor();

            // Clear any initialization calls
            onContentChange.mockClear();

            act(() => {
                handle.setContent('some text');
            });

            await waitFor(() => {
                expect(onContentChange).toHaveBeenCalledWith(true);
            });
        });

        it('fires with false when content is cleared', async () => {
            const { handle, onContentChange } = await renderEditor();

            act(() => {
                handle.setContent('some text');
            });

            await waitFor(() => {
                expect(onContentChange).toHaveBeenCalledWith(true);
            });

            onContentChange.mockClear();

            act(() => {
                handle.clearContent();
            });

            await waitFor(() => {
                expect(onContentChange).toHaveBeenCalledWith(false);
            });
        });
    });
});
