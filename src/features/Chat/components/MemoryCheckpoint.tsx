// =============================================================================
// AI CHAT: Memory Checkpoint — Inline expandable marker in chat timeline
// =============================================================================

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Brain, ChevronDown, Pencil, Check, X, Trash2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { ConversationMemory } from '../../../core/types/chat';

interface MemoryCheckpointProps {
    memory: ConversationMemory;
    onUpdate: (memoryId: string, content: string) => Promise<void>;
    onDelete: (memoryId: string) => Promise<void>;
}

export const MemoryCheckpoint: React.FC<MemoryCheckpointProps> = ({ memory, onUpdate, onDelete }) => {
    const [isExpanded, setIsExpanded] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [editText, setEditText] = useState(memory.content);
    const [isSaving, setIsSaving] = useState(false);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const rootRef = useRef<HTMLDivElement>(null);

    // Auto-resize textarea
    useEffect(() => {
        if (isEditing && textareaRef.current) {
            const el = textareaRef.current;
            el.style.height = 'auto';
            el.style.height = el.scrollHeight + 'px';
            el.focus();
        }
    }, [isEditing]);

    // Scroll checkpoint to top of chat when expanded
    useEffect(() => {
        if (isExpanded && rootRef.current) {
            // Small delay to let content render before scrolling
            requestAnimationFrame(() => {
                rootRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            });
        }
    }, [isExpanded]);

    const handleSave = useCallback(async () => {
        if (!editText.trim() || editText === memory.content) {
            setIsEditing(false);
            setEditText(memory.content);
            return;
        }
        setIsSaving(true);
        try {
            await onUpdate(memory.id, editText.trim());
            setIsEditing(false);
        } finally {
            setIsSaving(false);
        }
    }, [editText, memory.content, memory.id, onUpdate]);

    const handleDelete = useCallback(async () => {
        setIsSaving(true);
        try {
            await onDelete(memory.id);
        } finally {
            setIsSaving(false);
        }
    }, [memory.id, onDelete]);

    const handleCancel = useCallback(() => {
        setIsEditing(false);
        setEditText(memory.content);
    }, [memory.content]);

    return (
        <div className="my-1" ref={rootRef}>
            {/* Divider line with checkpoint label */}
            <button
                className="w-full flex items-center gap-2 group cursor-pointer bg-transparent border-none p-0"
                onClick={() => setIsExpanded(v => !v)}
            >
                <div className="flex-1 h-px" style={{ backgroundColor: 'color-mix(in srgb, var(--accent) 25%, transparent)' }} />
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] transition-colors group-hover:bg-white/[0.03]"
                    style={{ color: 'var(--accent)' }}
                >
                    <Brain size={12} />
                    <span className="font-medium truncate max-w-[200px]">{memory.conversationTitle}</span>
                    <ChevronDown
                        size={12}
                        className={`transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
                    />
                </div>
                <div className="flex-1 h-px" style={{ backgroundColor: 'color-mix(in srgb, var(--accent) 25%, transparent)' }} />
            </button>

            {/* Expandable content */}
            {isExpanded && (
                <div
                    className="mt-1.5 mx-auto max-w-[90%] rounded-lg p-3 animate-memory-expand"
                    style={{
                        backgroundColor: 'color-mix(in srgb, var(--accent) 5%, var(--bg-primary))',
                    }}
                >
                    {isEditing ? (
                        <>
                            <textarea
                                ref={textareaRef}
                                value={editText}
                                onChange={(e) => {
                                    setEditText(e.target.value);
                                    e.target.style.height = 'auto';
                                    e.target.style.height = e.target.scrollHeight + 'px';
                                }}
                                className="w-full bg-transparent text-sm text-text-primary outline-none resize-none border rounded-md p-2"
                                style={{ borderColor: 'color-mix(in srgb, var(--accent) 25%, transparent)' }}
                                onKeyDown={(e) => {
                                    if (e.key === 'Escape') {
                                        e.stopPropagation();
                                        handleCancel();
                                    }
                                }}
                                disabled={isSaving}
                            />
                            <div className="flex items-center justify-end gap-1.5 mt-2">
                                <button
                                    className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] text-text-tertiary bg-transparent border-none cursor-pointer hover:text-text-secondary hover:bg-white/[0.05] transition-colors"
                                    onClick={handleCancel}
                                    disabled={isSaving}
                                >
                                    <X size={12} /> Cancel
                                </button>
                                <button
                                    className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] bg-transparent border-none cursor-pointer hover:bg-white/[0.05] transition-colors disabled:opacity-50"
                                    style={{ color: 'var(--accent)' }}
                                    onClick={handleSave}
                                    disabled={isSaving}
                                >
                                    <Check size={12} /> Save
                                </button>
                            </div>
                        </>
                    ) : (
                        <>
                            <div className="prose prose-sm prose-invert max-w-none text-text-secondary
                                [&_h1]:text-sm [&_h1]:font-semibold [&_h1]:text-text-primary [&_h1]:mt-0 [&_h1]:mb-2
                                [&_h2]:text-[13px] [&_h2]:font-semibold [&_h2]:text-text-primary [&_h2]:mt-3 [&_h2]:mb-1.5
                                [&_h3]:text-xs [&_h3]:font-semibold [&_h3]:text-text-primary [&_h3]:mt-2 [&_h3]:mb-1
                                [&_p]:text-sm [&_p]:leading-relaxed [&_p]:my-1.5
                                [&_ul]:text-sm [&_ul]:my-1.5 [&_ul]:pl-4
                                [&_ol]:text-sm [&_ol]:my-1.5 [&_ol]:pl-4
                                [&_li]:my-0.5
                                [&_strong]:text-text-primary [&_strong]:font-semibold
                                [&_a]:underline
                            ">
                                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                    {memory.content}
                                </ReactMarkdown>
                            </div>
                            <div className="flex items-center justify-end gap-1 mt-2">
                                <button
                                    className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] text-text-tertiary bg-transparent border-none cursor-pointer hover:text-text-secondary hover:bg-white/[0.05] transition-colors"
                                    onClick={() => {
                                        setIsEditing(true);
                                        // Double rAF: first lets textarea render, second lets auto-resize complete
                                        requestAnimationFrame(() => {
                                            requestAnimationFrame(() => {
                                                rootRef.current?.scrollIntoView({ behavior: 'instant', block: 'start' });
                                            });
                                        });
                                    }}
                                >
                                    <Pencil size={11} /> Edit
                                </button>
                                <button
                                    className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] text-text-tertiary bg-transparent border-none cursor-pointer hover:text-red-400 hover:bg-red-500/10 transition-colors"
                                    onClick={handleDelete}
                                    disabled={isSaving}
                                >
                                    <Trash2 size={11} /> Delete
                                </button>
                            </div>
                        </>
                    )}
                </div>
            )}
        </div>
    );
};
