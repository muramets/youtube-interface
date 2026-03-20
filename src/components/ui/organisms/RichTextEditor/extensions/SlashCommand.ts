import { Extension } from '@tiptap/core'
import { PluginKey } from '@tiptap/pm/state'
import { Suggestion } from '@tiptap/suggestion'
import { ReactRenderer } from '@tiptap/react'
import { SlashCommandList, type SlashCommandListRef } from '../components/SlashCommandList'
import { filterSlashCommands, type SlashCommandItem } from '../constants/slashCommands'
import { positionSuggestionPopup } from '../utils/positionSuggestionPopup'

const SLASH_MAX_HEIGHT = 320

/**
 * SlashCommand — Tiptap extension for /-triggered block command palette.
 *
 * Typing '/' opens a dropdown with block commands (headings, lists, etc.).
 * Typing after '/' filters the list. Arrow keys + Enter to select.
 *
 * Uses @tiptap/suggestion (same framework as @-video mentions).
 */
export const SlashCommand = Extension.create({
    name: 'slashCommand',

    addProseMirrorPlugins() {
        return [
            Suggestion<SlashCommandItem>({
                editor: this.editor,
                pluginKey: new PluginKey('slashCommand'),
                char: '/',
                allowSpaces: false,
                startOfLine: false,

                allow: ({ editor }) =>
                    !editor.isActive('codeBlock') && !editor.isActive('code'),

                items: ({ query }) => filterSlashCommands(query),

                command: ({ editor, range, props }) => {
                    props.action(editor, range)
                },

                render: () => {
                    let renderer: ReactRenderer<SlashCommandListRef> | null = null
                    let popup: HTMLDivElement | null = null
                    let removeScrollListener: (() => void) | null = null
                    let latestClientRect: (() => DOMRect | null) | null = null

                    return {
                        onStart(props) {
                            latestClientRect = props.clientRect ?? null

                            renderer = new ReactRenderer(SlashCommandList, {
                                props,
                                editor: props.editor,
                            })

                            popup = document.createElement('div')
                            popup.dataset.suggestionPopup = ''
                            popup.style.zIndex = '700' // z-tooltip
                            popup.appendChild(renderer.element)
                            document.body.appendChild(popup)

                            if (popup && renderer) {
                                positionSuggestionPopup(popup, renderer.element, latestClientRect?.() ?? null, SLASH_MAX_HEIGHT)
                            }

                            const onScroll = () => {
                                if (popup && renderer && latestClientRect) {
                                    positionSuggestionPopup(popup, renderer.element, latestClientRect() ?? null, SLASH_MAX_HEIGHT)
                                }
                            }
                            window.addEventListener('scroll', onScroll, { capture: true, passive: true })
                            removeScrollListener = () => window.removeEventListener('scroll', onScroll, true)
                        },

                        onUpdate(props) {
                            latestClientRect = props.clientRect ?? null
                            renderer?.updateProps(props)

                            if (popup && renderer) {
                                positionSuggestionPopup(popup, renderer.element, latestClientRect?.() ?? null, SLASH_MAX_HEIGHT)
                            }
                        },

                        onKeyDown(props) {
                            if (props.event.key === 'Escape') {
                                removeScrollListener?.()
                                removeScrollListener = null
                                popup?.remove()
                                popup = null
                                renderer?.destroy()
                                renderer = null
                                return true
                            }
                            return renderer?.ref?.onKeyDown(props) ?? false
                        },

                        onExit() {
                            removeScrollListener?.()
                            removeScrollListener = null
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
