import { forwardRef, useImperativeHandle, useMemo, useEffect } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import { useChatEditorExtensions } from '../hooks/useChatEditorExtensions'
import { useChatTurndownService } from '../hooks/useChatTurndownService'
import { parseMarkdownToHTML } from '../../../components/ui/organisms/RichTextEditor/utils/markdownParser'
import { VideoRefContext } from '../../../components/ui/organisms/RichTextEditor/extensions/VideoRefContext'
import { KiRefContext } from '../../../components/ui/organisms/RichTextEditor/extensions/KiRefContext'
import { buildCatalogVideoMap, buildCatalogKiMap } from '../../../components/ui/organisms/RichTextEditor/utils/catalogMaps'
import type { VideoPreviewData } from '../../Video/types'
import type { KiPreviewData } from '../../../components/ui/organisms/RichTextEditor/types'

const CHAT_EDITOR_CLASSES = 'focus:outline-none text-[13px] leading-snug text-text-primary caret-text-secondary font-[inherit]'

export interface ChatTiptapEditorHandle {
    getMarkdown: () => string
    clearContent: () => void
    setContent: (markdown: string) => void
    focus: () => void
    isEmpty: () => boolean
}

interface ChatTiptapEditorProps {
    onSend: () => void
    onAddFiles: (files: File[]) => void
    onContentChange: (hasContent: boolean) => void
    placeholder?: string
    disabled?: boolean
    videoCatalog?: VideoPreviewData[]
    knowledgeCatalog?: KiPreviewData[]
}

export const ChatTiptapEditor = forwardRef<ChatTiptapEditorHandle, ChatTiptapEditorProps>(({
    onSend,
    onAddFiles,
    onContentChange,
    placeholder = 'Message…',
    disabled = false,
    videoCatalog,
    knowledgeCatalog,
}, ref) => {
    const extensions = useChatEditorExtensions(
        placeholder,
        videoCatalog ?? [],
        knowledgeCatalog ?? [],
        onSend,
    )
    const turndownService = useChatTurndownService()

    const editor = useEditor({
        extensions,
        content: '',
        editorProps: {
            attributes: { class: CHAT_EDITOR_CLASSES },
            handlePaste: (_view, event) => {
                const items = event.clipboardData?.items
                if (!items) return false
                const files: File[] = []
                for (const item of items) {
                    if (item.kind === 'file') {
                        const file = item.getAsFile()
                        if (file) files.push(file)
                    }
                }
                if (files.length > 0) {
                    event.preventDefault()
                    onAddFiles(files)
                    return true
                }
                return false
            },
            handleDrop: (_view, event) => {
                const files = event.dataTransfer?.files
                if (files && files.length > 0) {
                    event.preventDefault()
                    onAddFiles(Array.from(files))
                    return true
                }
                return false
            },
        },
        onUpdate: ({ editor: e }) => {
            onContentChange(!e.isEmpty)
        },
    })

    // Sync disabled state
    useEffect(() => {
        if (!editor) return
        editor.setEditable(!disabled)
    }, [editor, disabled])

    // Build context maps for VideoRefView / KiRefView tooltips
    const videoMap = useMemo(() => buildCatalogVideoMap(videoCatalog), [videoCatalog])
    const kiMap = useMemo(() => buildCatalogKiMap(knowledgeCatalog), [knowledgeCatalog])

    // Imperative handle for parent (ChatInput)
    useImperativeHandle(ref, () => ({
        getMarkdown: () => {
            if (!editor) return ''
            return turndownService.turndown(editor.getHTML())
        },
        clearContent: () => {
            editor?.commands.clearContent()
        },
        setContent: (markdown: string) => {
            if (!editor) return
            editor.commands.setContent(parseMarkdownToHTML(markdown))
        },
        focus: () => {
            editor?.commands.focus()
        },
        isEmpty: () => editor?.isEmpty ?? true,
    }), [editor, turndownService])

    return (
        <KiRefContext.Provider value={kiMap}>
        <VideoRefContext.Provider value={videoMap}>
            <div className="chat-tiptap-editor">
                <EditorContent editor={editor} />
            </div>
        </VideoRefContext.Provider>
        </KiRefContext.Provider>
    )
})

ChatTiptapEditor.displayName = 'ChatTiptapEditor'
