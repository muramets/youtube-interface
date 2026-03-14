import { Editor } from '@tiptap/react'
import { CopyButton } from './CopyButton'

/**
 * DebugPanel Component
 *
 * Developer tool for inspecting editor content in HTML and JSON formats.
 * Useful for debugging markdown conversion issues and understanding editor state.
 */

interface DebugPanelProps {
    editor: Editor
}

export const DebugPanel = ({ editor }: DebugPanelProps) => {
    if (!editor) return null

    const html = editor.getHTML()
    const json = editor.getJSON()

    return (
        <div className="mt-8 p-4 bg-black/40 rounded-xl border border-border text-xs font-mono overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between mb-4 pb-2 border-b border-border">
                <span className="text-text-secondary font-bold uppercase tracking-wider">Editor Debugger</span>
                <div className="flex gap-2">
                    <span className="px-2 py-0.5 rounded bg-blue-500/20 text-blue-400">HTML</span>
                    <span className="px-2 py-0.5 rounded bg-green-500/20 text-green-400">JSON</span>
                </div>
            </div>

            {/* Content Grid */}
            <div className="grid grid-cols-2 gap-4 h-[400px]">
                {/* HTML Output */}
                <div className="flex flex-col gap-2 h-full relative min-h-0">
                    <div className="flex items-center justify-between pointer-events-none">
                        <span className="text-text-secondary">HTML Source:</span>
                    </div>
                    <div className="absolute top-0 right-0 z-10">
                        <CopyButton text={html} />
                    </div>
                    <pre className="flex-1 p-3 bg-black/50 rounded-lg border border-white/5 overflow-auto custom-scrollbar text-white/70 whitespace-pre-wrap break-all mt-1 min-h-0">
                        {html}
                    </pre>
                </div>

                {/* JSON Output */}
                <div className="flex flex-col gap-2 h-full relative min-h-0">
                    <div className="flex items-center justify-between pointer-events-none">
                        <span className="text-text-secondary">JSON Structure:</span>
                    </div>
                    <div className="absolute top-0 right-0 z-10">
                        <CopyButton text={JSON.stringify(json, null, 2)} />
                    </div>
                    <pre className="flex-1 p-3 bg-black/50 rounded-lg border border-white/5 overflow-auto custom-scrollbar text-green-400/80 mt-1 min-h-0">
                        {JSON.stringify(json, null, 2)}
                    </pre>
                </div>
            </div>
        </div>
    )
}
