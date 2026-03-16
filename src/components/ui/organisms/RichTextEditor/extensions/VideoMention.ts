import { Extension } from '@tiptap/core'
import { PluginKey } from '@tiptap/pm/state'
import { Suggestion } from '@tiptap/suggestion'
import { ReactRenderer } from '@tiptap/react'
import type { VideoPreviewData } from '../../../../../features/Video/types'
import { VideoSuggestionList, type VideoSuggestionListRef } from '../components/VideoSuggestionList'

export interface VideoMentionOptions {
    videoCatalog: VideoPreviewData[]
}

/**
 * VideoMention — Tiptap extension for @-autocomplete of video references.
 *
 * Typing '@' + 2 chars opens a dropdown with matching videos.
 * Selecting a video inserts a videoRef mark: [title](vid://ID).
 *
 * Uses @tiptap/suggestion for the autocomplete framework.
 */
export const VideoMention = Extension.create<VideoMentionOptions>({
    name: 'videoMention',

    addOptions() {
        return { videoCatalog: [] }
    },

    addProseMirrorPlugins() {
        const { videoCatalog } = this.options

        return [
            Suggestion<VideoPreviewData, VideoPreviewData>({
                editor: this.editor,
                pluginKey: new PluginKey('videoMention'),
                char: '@',
                allowSpaces: true,
                startOfLine: false,

                allow: ({ editor }) => !editor.isActive('codeBlock') && !editor.isActive('code'),

                items: ({ query }) => {
                    if (query.length < 2) return []
                    const q = query.toLowerCase()
                    return videoCatalog
                        .filter(v =>
                            v.title.toLowerCase().includes(q) ||
                            v.videoId.toLowerCase().includes(q) ||
                            (v.youtubeVideoId && v.youtubeVideoId.toLowerCase().includes(q))
                        )
                        .slice(0, 10)
                },

                command: ({ editor, range, props }) => {
                    editor
                        .chain()
                        .focus()
                        .deleteRange(range)
                        .insertContent({
                            type: 'text',
                            text: props.title,
                            marks: [{
                                type: 'videoRef',
                                attrs: { videoId: props.videoId, title: props.title },
                            }],
                        })
                        .unsetMark('videoRef')
                        .run()
                },

                render: () => {
                    let renderer: ReactRenderer<VideoSuggestionListRef> | null = null
                    let popup: HTMLDivElement | null = null

                    return {
                        onStart(props) {
                            renderer = new ReactRenderer(VideoSuggestionList, {
                                props,
                                editor: props.editor,
                            })

                            popup = document.createElement('div')
                            popup.style.position = 'absolute'
                            popup.style.zIndex = '700' // z-tooltip from design system
                            popup.appendChild(renderer.element)
                            document.body.appendChild(popup)

                            const rect = props.clientRect?.()
                            if (rect && popup) {
                                popup.style.left = `${rect.left}px`
                                popup.style.top = `${rect.bottom + 4}px`
                            }
                        },

                        onUpdate(props) {
                            renderer?.updateProps(props)

                            const rect = props.clientRect?.()
                            if (rect && popup) {
                                popup.style.left = `${rect.left}px`
                                popup.style.top = `${rect.bottom + 4}px`
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
