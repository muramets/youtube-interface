import { useEffect, useMemo, useRef } from 'react'
import { Extension } from '@tiptap/core'
import type { Extensions } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import { VideoRefMark } from '../../../components/ui/organisms/RichTextEditor/extensions/VideoRefMark'
import { KiRefMark } from '../../../components/ui/organisms/RichTextEditor/extensions/KiRefMark'
import { UnifiedMention } from '../../../components/ui/organisms/RichTextEditor/extensions/UnifiedMention'
import type { VideoPreviewData } from '../../Video/types'
import type { KiPreviewData } from '../../../components/ui/organisms/RichTextEditor/types'

/**
 * Minimal Tiptap extensions for chat input.
 *
 * Includes only: basic text editing, placeholder, video/KI marks,
 * @-mention autocomplete (popup opens upward), and Enter-to-send shortcut.
 *
 * ⚠️ videoCatalog/knowledgeCatalog/onSend are NOT in useMemo deps.
 * Tiptap destroys/recreates the editor when extensions change — catalogs
 * are read via closure (this.options) on each keystroke, and onSend via ref.
 */
export function useChatEditorExtensions(
    placeholder: string,
    videoCatalog: VideoPreviewData[],
    knowledgeCatalog: KiPreviewData[],
    onSend: () => void,
): Extensions {
    // Callback ref pattern — updated via effect, read only in event handlers
    const onSendRef = useRef<(() => void) | null>(null)
    useEffect(() => { onSendRef.current = onSend }, [onSend])

    return useMemo(() => {
        /**
         * ChatKeyboardShortcuts — Enter to send, Shift+Enter for newline.
         *
         * Enter handler checks if @-mention dropdown is open (via DOM data attribute)
         * before calling onSend — otherwise Enter would send instead of selecting a mention.
         * Defined inline to capture onSendRef via closure (avoids passing ref through configure).
         */
        const ChatKeyboardShortcuts = Extension.create({
            name: 'chatKeyboardShortcuts',

            addKeyboardShortcuts() {
                return {
                    Enter: () => {
                        if (document.querySelector('[data-suggestion-popup]')) return false
                        onSendRef.current?.()
                        return true
                    },
                    'Shift-Enter': ({ editor }) => {
                        editor.commands.setHardBreak()
                        return true
                    },
                }
            },
        })

        return [
            StarterKit.configure({
                heading: false,
                codeBlock: false,
                code: false,
                listItem: false,
                bulletList: false,
                orderedList: false,
                blockquote: false,
                horizontalRule: false,
            }),

            Placeholder.configure({ placeholder }),

            VideoRefMark,
            KiRefMark,

            UnifiedMention.configure({
                videoCatalog,
                knowledgeCatalog,
                popupDirection: 'up',
            }),

            ChatKeyboardShortcuts,
        ]
    }, [placeholder, videoCatalog, knowledgeCatalog])
}
