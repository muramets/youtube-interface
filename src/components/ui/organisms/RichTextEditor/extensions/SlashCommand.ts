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

                    return {
                        onStart(props) {
                            renderer = new ReactRenderer(SlashCommandList, {
                                props,
                                editor: props.editor,
                            })

                            popup = document.createElement('div')
                            popup.style.position = 'absolute'
                            popup.style.zIndex = '700' // z-tooltip
                            popup.appendChild(renderer.element)
                            document.body.appendChild(popup)

                            if (popup && renderer) {
                                positionSuggestionPopup(popup, renderer.element, props.clientRect?.() ?? null, SLASH_MAX_HEIGHT)
                            }
                        },

                        onUpdate(props) {
                            renderer?.updateProps(props)

                            if (popup && renderer) {
                                positionSuggestionPopup(popup, renderer.element, props.clientRect?.() ?? null, SLASH_MAX_HEIGHT)
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
