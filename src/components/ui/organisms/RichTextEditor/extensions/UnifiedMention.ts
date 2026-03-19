import { Extension } from '@tiptap/core'
import { PluginKey } from '@tiptap/pm/state'
import { Suggestion } from '@tiptap/suggestion'
import { ReactRenderer } from '@tiptap/react'
import type { VideoPreviewData } from '../../../../../features/Video/types'
import type { KiPreviewData } from '../types'
import {
    UnifiedSuggestionList,
    type UnifiedSuggestionListRef,
    type SuggestionItem,
    type MentionMode,
} from '../components/UnifiedSuggestionList'
import { positionSuggestionPopup } from '../utils/positionSuggestionPopup'

const POPUP_MAX_HEIGHT = 340 // slightly taller than before to accommodate tab bar

export interface UnifiedMentionOptions {
    videoCatalog: VideoPreviewData[]
    knowledgeCatalog: KiPreviewData[]
}

/**
 * UnifiedMention — Tiptap extension for @-autocomplete of videos and Knowledge Items.
 *
 * Typing '@' + 2 chars opens a tabbed dropdown (Videos | Knowledge).
 * - Tab key switches between modes
 * - Selecting a video inserts a videoRef mark: [title](vid://ID)
 * - Selecting a KI inserts a kiRef mark: [title](ki://ID)
 *
 * Replaces the old VideoMention extension.
 */
export const UnifiedMention = Extension.create<UnifiedMentionOptions>({
    name: 'unifiedMention',

    addOptions() {
        return { videoCatalog: [], knowledgeCatalog: [] }
    },

    addProseMirrorPlugins() {
        const { videoCatalog, knowledgeCatalog } = this.options

        // Shared mode state — persists across filter calls within a single @-session
        let currentMode: MentionMode = 'videos'

        const filterItems = (query: string): SuggestionItem[] => {
            if (query.length < 2) return []
            const q = query.toLowerCase()

            if (currentMode === 'videos') {
                return videoCatalog
                    .filter(v =>
                        v.title.toLowerCase().includes(q) ||
                        v.videoId.toLowerCase().includes(q) ||
                        (v.youtubeVideoId && v.youtubeVideoId.toLowerCase().includes(q))
                    )
                    .slice(0, 10)
                    .map(data => ({ kind: 'video' as const, data }))
            }

            return knowledgeCatalog
                .filter(ki =>
                    ki.title.toLowerCase().includes(q) ||
                    ki.category.toLowerCase().includes(q)
                )
                .slice(0, 10)
                .map(data => ({ kind: 'ki' as const, data }))
        }

        return [
            Suggestion<SuggestionItem, SuggestionItem>({
                editor: this.editor,
                pluginKey: new PluginKey('unifiedMention'),
                char: '@',
                allowSpaces: true,
                startOfLine: false,

                allow: ({ editor }) => !editor.isActive('codeBlock') && !editor.isActive('code'),

                items: ({ query }) => filterItems(query),

                command: ({ editor, range, props: item }) => {
                    if (item.kind === 'video') {
                        editor
                            .chain()
                            .focus()
                            .deleteRange(range)
                            .insertContent({
                                type: 'text',
                                text: item.data.title,
                                marks: [{
                                    type: 'videoRef',
                                    attrs: { videoId: item.data.videoId, title: item.data.title },
                                }],
                            })
                            .unsetMark('videoRef')
                            .run()
                    } else {
                        editor
                            .chain()
                            .focus()
                            .deleteRange(range)
                            .insertContent({
                                type: 'text',
                                text: item.data.title,
                                marks: [{
                                    type: 'kiRef',
                                    attrs: { kiId: item.data.id, title: item.data.title },
                                }],
                            })
                            .unsetMark('kiRef')
                            .run()
                    }
                },

                render: () => {
                    let renderer: ReactRenderer<UnifiedSuggestionListRef> | null = null
                    let popup: HTMLDivElement | null = null
                    let lastQuery = ''

                    // Build props for the suggestion list, with onModeChange wired to re-filter
                    const buildListProps = (baseProps: object, items: SuggestionItem[]) => ({
                        ...baseProps,
                        items,
                        mode: currentMode,
                        queryLength: lastQuery.length,
                        hasVideos: videoCatalog.length > 0,
                        hasKnowledge: knowledgeCatalog.length > 0,
                        onModeChange: (mode: MentionMode) => {
                            currentMode = mode
                            const refiltered = filterItems(lastQuery)
                            renderer?.updateProps(buildListProps(baseProps, refiltered))
                        },
                    })

                    return {
                        onStart(props) {
                            currentMode = 'videos'
                            lastQuery = (props as unknown as { query: string }).query

                            renderer = new ReactRenderer(UnifiedSuggestionList, {
                                props: buildListProps(props, filterItems(lastQuery)),
                                editor: props.editor,
                            })

                            popup = document.createElement('div')
                            popup.style.position = 'absolute'
                            popup.style.zIndex = '700'
                            popup.appendChild(renderer.element)
                            document.body.appendChild(popup)

                            if (popup && renderer) {
                                positionSuggestionPopup(popup, renderer.element, props.clientRect?.() ?? null, POPUP_MAX_HEIGHT)
                            }
                        },

                        onUpdate(props) {
                            lastQuery = (props as unknown as { query: string }).query
                            renderer?.updateProps(buildListProps(props, filterItems(lastQuery)))

                            if (popup && renderer) {
                                positionSuggestionPopup(popup, renderer.element, props.clientRect?.() ?? null, POPUP_MAX_HEIGHT)
                            }
                        },

                        onKeyDown(props) {
                            if (props.event.key === 'Escape') {
                                popup?.remove()
                                popup = null
                                renderer?.destroy()
                                renderer = null
                                return true
                            }
                            return renderer?.ref?.onKeyDown(props) ?? false
                        },

                        onExit() {
                            popup?.remove()
                            popup = null
                            renderer?.destroy()
                            renderer = null
                        },
                    }
                },
            }),
        ]
    },
})
