import { Editor } from '@tiptap/react'
import * as Popover from '@radix-ui/react-popover'
import { MoreHorizontal } from 'lucide-react'

/**
 * TableMenu Component
 *
 * Context menu for table operations (add/delete rows/columns, toggle header).
 * Only visible when cursor is inside a table.
 */

interface TableMenuProps {
    editor: Editor
}

export const TableMenu = ({ editor }: TableMenuProps) => {
    if (!editor.isActive('table')) return null

    return (
        <Popover.Root>
            <Popover.Trigger asChild>
                <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    title="Table Options"
                    className="p-1.5 rounded-md transition-colors text-text-secondary hover:text-text-primary hover:bg-hover-bg bg-text-secondary/20 text-text-primary"
                    aria-label="Table Options"
                >
                    <MoreHorizontal size={16} />
                </button>
            </Popover.Trigger>

            <Popover.Portal>
                <Popover.Content
                    className="z-modal p-1 bg-bg-secondary border border-border rounded-xl shadow-2xl flex flex-col min-w-[140px] animate-in fade-in zoom-in-95 duration-200"
                    sideOffset={5}
                    onOpenAutoFocus={(e) => e.preventDefault()}
                >
                    <div className="flex flex-col gap-1">
                        {/* Column operations */}
                        <button
                            onClick={() => editor.chain().focus().addColumnBefore().run()}
                            className="text-left px-2 py-1 hover:bg-text-secondary/10 rounded text-xs"
                        >
                            Add Column Before
                        </button>
                        <button
                            onClick={() => editor.chain().focus().addColumnAfter().run()}
                            className="text-left px-2 py-1 hover:bg-text-secondary/10 rounded text-xs"
                        >
                            Add Column After
                        </button>
                        <button
                            onClick={() => editor.chain().focus().deleteColumn().run()}
                            className="text-left px-2 py-1 hover:bg-text-secondary/10 rounded text-xs text-error"
                        >
                            Delete Column
                        </button>

                        <div className="h-px bg-border my-1" />

                        {/* Row operations */}
                        <button
                            onClick={() => editor.chain().focus().addRowBefore().run()}
                            className="text-left px-2 py-1 hover:bg-text-secondary/10 rounded text-xs"
                        >
                            Add Row Before
                        </button>
                        <button
                            onClick={() => editor.chain().focus().addRowAfter().run()}
                            className="text-left px-2 py-1 hover:bg-text-secondary/10 rounded text-xs"
                        >
                            Add Row After
                        </button>
                        <button
                            onClick={() => editor.chain().focus().deleteRow().run()}
                            className="text-left px-2 py-1 hover:bg-text-secondary/10 rounded text-xs text-error"
                        >
                            Delete Row
                        </button>

                        <div className="h-px bg-border my-1" />

                        {/* Table-level operations */}
                        <button
                            onClick={() => editor.chain().focus().toggleHeaderRow().run()}
                            className="text-left px-2 py-1 hover:bg-text-secondary/10 rounded text-xs"
                        >
                            Toggle Header Row
                        </button>
                        <button
                            onClick={() => editor.chain().focus().deleteTable().run()}
                            className="text-left px-2 py-1 hover:bg-text-secondary/10 rounded text-xs text-error"
                        >
                            Delete Table
                        </button>
                    </div>
                </Popover.Content>
            </Popover.Portal>
        </Popover.Root>
    )
}
