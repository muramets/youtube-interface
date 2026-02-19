// =============================================================================
// AI CHAT: Chat Input Component
// =============================================================================

import React, { useState, useRef, useCallback, useMemo, useLayoutEffect } from 'react';
import { Plus, Send, X, FileAudio, FileVideo, File, Image, Square, Loader2, Check, AlertCircle, ChevronUp, Pencil } from 'lucide-react';
import { MODEL_REGISTRY } from '../../core/types/chat';
import { getAttachmentType } from '../../core/services/aiService';
import type { StagedFile, ReadyAttachment } from '../../core/types/chatAttachment';
import { useChatStore } from '../../core/stores/chatStore';
import { useAppContextStore } from '../../core/stores/appContextStore';
import type { VideoCardContext, SuggestedTrafficContext } from '../../core/types/appContext';
import { VideoCardChip } from './VideoCardChip';
import { SuggestedTrafficChip } from './SuggestedTrafficChip';
import { PortalTooltip } from '../../components/ui/atoms/PortalTooltip';

interface ChatInputProps {
    onSend: (text: string, attachments?: ReadyAttachment[]) => void;
    onStop?: () => void;
    disabled?: boolean;
    // Staged file management (from useFileAttachments)
    stagedFiles: StagedFile[];
    onAddFiles: (files: File[]) => void;
    onRemoveFile: (id: string) => void;
    isAnyUploading: boolean;
    // Model selector
    modelLabel?: string;
    activeModel?: string;
    onModelChange?: (modelId: string) => void;
    // Editing
    editingMessage?: import('../../core/types/chat').ChatMessage | null;
    onCancelEdit?: () => void;
    onEditSend?: (newText: string, attachments?: ReadyAttachment[]) => void;
}

const MAX_INPUT_HEIGHT = 120;

export const ChatInput: React.FC<ChatInputProps> = ({
    onSend, onStop, disabled,
    stagedFiles, onAddFiles, onRemoveFile, isAnyUploading,
    modelLabel, activeModel, onModelChange,
    editingMessage, onCancelEdit, onEditSend,
}) => {
    const isStreaming = useChatStore(s => s.isStreaming);
    const contextItems = useAppContextStore(s => s.items);
    const setContextItems = useAppContextStore(s => s.setItems);
    const videoContextItems = useMemo(() => contextItems.filter((c): c is VideoCardContext => c.type === 'video-card'), [contextItems]);
    const trafficContextItems = useMemo(() => contextItems.filter((c): c is SuggestedTrafficContext => c.type === 'suggested-traffic'), [contextItems]);
    const [text, setText] = useState('');
    const [isModelMenuOpen, setIsModelMenuOpen] = useState(false);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const modelMenuRef = useRef<HTMLDivElement>(null);
    const prevEditingRef = useRef(editingMessage);

    // Sync text with editingMessage changes synchronously during render
    // (standard "store previous props" pattern — ref access during render is intentional)
    // eslint-disable-next-line react-hooks/refs -- reading/writing prevEditingRef.current during render is the documented "previous props" pattern
    if (editingMessage !== prevEditingRef.current) {
        prevEditingRef.current = editingMessage; // eslint-disable-line react-hooks/refs
        if (editingMessage) {
            setText(editingMessage.text);
        }
    }

    const canSend = (text.trim() || stagedFiles.length > 0) && !isAnyUploading;

    // Auto-resize and focus textarea when editing starts
    useLayoutEffect(() => {
        if (editingMessage) {
            requestAnimationFrame(() => {
                const el = textareaRef.current;
                if (el) {
                    el.style.height = 'auto';
                    el.style.height = Math.min(el.scrollHeight, MAX_INPUT_HEIGHT) + 'px';
                    el.style.overflowY = el.scrollHeight > MAX_INPUT_HEIGHT ? 'auto' : 'hidden';
                    el.focus();
                }
            });
        }
    }, [editingMessage]);

    const handleRemoveVideoContext = useCallback((videoId: string) => {
        setContextItems(contextItems.filter(c => c.type !== 'video-card' || (c as VideoCardContext).videoId !== videoId));
    }, [contextItems, setContextItems]);

    const handleSend = useCallback(() => {
        const trimmed = text.trim();
        if (!trimmed && stagedFiles.length === 0) return;
        if (isAnyUploading) return;

        const readyAttachments = stagedFiles
            .filter((f): f is StagedFile & { result: ReadyAttachment } => f.status === 'ready' && !!f.result)
            .map((f) => f.result);

        const attachments = readyAttachments.length > 0 ? readyAttachments : undefined;

        if (editingMessage && onEditSend) {
            onEditSend(trimmed, attachments);
        } else {
            onSend(trimmed, attachments);
        }
        setText('');
        if (textareaRef.current) {
            textareaRef.current.style.height = 'auto';
        }
    }, [text, stagedFiles, isAnyUploading, onSend, editingMessage, onEditSend]);

    const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    }, [handleSend]);

    const handleCancel = useCallback(() => {
        if (onCancelEdit) onCancelEdit();
        setText('');
        if (textareaRef.current) textareaRef.current.style.height = 'auto';
    }, [onCancelEdit]);

    const handleTextChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
        setText(e.target.value);
        const el = e.target;
        el.style.height = 'auto';
        el.style.height = Math.min(el.scrollHeight, MAX_INPUT_HEIGHT) + 'px';
        el.style.overflowY = el.scrollHeight > MAX_INPUT_HEIGHT ? 'auto' : 'hidden';
    }, []);

    const handleFileSelect = useCallback((selectedFiles: FileList | null) => {
        if (!selectedFiles) return;
        onAddFiles(Array.from(selectedFiles));
        if (fileInputRef.current) fileInputRef.current.value = '';
    }, [onAddFiles]);

    const handlePaste = useCallback((e: React.ClipboardEvent) => {
        const items = e.clipboardData?.items;
        if (!items) return;
        const files: File[] = [];
        for (const item of items) {
            if (item.kind === 'file') {
                const file = item.getAsFile();
                if (file) files.push(file);
            }
        }
        if (files.length > 0) {
            e.preventDefault();
            onAddFiles(files);
        }
    }, [onAddFiles]);

    const actionBtnClass = "shrink-0 w-7 h-7 rounded-md flex items-center justify-center cursor-pointer transition-colors duration-100 text-text-tertiary bg-transparent border-none hover:bg-white/[0.06] hover:text-text-secondary disabled:opacity-30 disabled:cursor-not-allowed";

    return (
        <div className="px-2.5 pb-2.5 bg-card-bg shrink-0">
            {/* Editing banner */}
            {editingMessage && (
                <div className="flex items-center gap-2 px-3 py-1.5 mb-1.5 rounded-lg bg-blue-500/10 border border-blue-500/20 text-xs text-blue-400">
                    <Pencil size={12} />
                    <span className="flex-1 truncate">Editing message</span>
                    <button
                        className="bg-transparent border-none text-blue-400 cursor-pointer p-0.5 flex hover:text-blue-300 transition-colors"
                        onClick={handleCancel}
                        title="Cancel editing"
                    >
                        <X size={14} />
                    </button>
                </div>
            )}
            {/* Video card context chips */}
            {videoContextItems.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-2">
                    {videoContextItems.map(v => (
                        <VideoCardChip
                            key={v.videoId}
                            video={v}
                            onRemove={() => handleRemoveVideoContext(v.videoId)}
                        />
                    ))}
                </div>
            )}
            {/* Suggested traffic context chips */}
            {trafficContextItems.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-2">
                    {trafficContextItems.map((tc, i) => (
                        <SuggestedTrafficChip
                            key={`traffic-${i}`}
                            context={tc}
                            onRemove={() => setContextItems(contextItems.filter(c => c !== tc))}
                        />
                    ))}
                </div>
            )}
            {stagedFiles.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-2">
                    {stagedFiles.map((staged) => {
                        const type = getAttachmentType(staged.file.type);
                        return (
                            <div
                                key={staged.id}
                                className={`flex items-center gap-1 px-2 py-1 rounded-md bg-video-edit-bg border border-border text-xs text-text-secondary transition-all duration-200 ${staged.status === 'uploading' ? 'opacity-75 animate-chip-pulse' : ''} ${staged.status === 'ready' ? 'border-emerald-500' : ''} ${staged.status === 'error' ? 'border-red-400' : ''}`}
                            >
                                {/* Status indicator */}
                                {staged.status === 'uploading' && (
                                    <Loader2 size={14} className="animate-spin" />
                                )}
                                {staged.status === 'ready' && (
                                    <Check size={14} className="text-emerald-500" />
                                )}
                                {staged.status === 'error' && (
                                    <PortalTooltip content={staged.error || 'Upload failed'} variant="glass" side="top">
                                        <span className="flex">
                                            <AlertCircle size={14} className="text-red-400" />
                                        </span>
                                    </PortalTooltip>
                                )}

                                {/* File type icon (only when not showing status) */}
                                {staged.status === 'ready' && (
                                    <>
                                        {type === 'image' && <Image size={14} />}
                                        {type === 'audio' && <FileAudio size={14} />}
                                        {type === 'video' && <FileVideo size={14} />}
                                        {type === 'file' && <File size={14} />}
                                    </>
                                )}

                                <span>
                                    {staged.file.name.length > 20
                                        ? staged.file.name.slice(0, 17) + '...'
                                        : staged.file.name}
                                </span>
                                <button className="bg-transparent border-none p-1 rounded text-text-tertiary cursor-pointer flex text-sm leading-none hover:bg-hover-bg hover:text-[var(--danger-color,#cc0000)] transition-colors" onClick={() => onRemoveFile(staged.id)} title="Remove">
                                    <X size={12} />
                                </button>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Unified input container */}
            <div className="border border-border rounded-xl bg-input-bg transition-colors duration-100 focus-within:border-text-tertiary">
                {/* Textarea — top part */}
                <textarea
                    ref={textareaRef}
                    className="chat-input-textarea w-full resize-none border-none rounded-t-xl pt-1.5 pb-2 px-3.5 text-[13px] leading-snug max-h-[120px] overflow-hidden bg-transparent text-text-primary outline-none font-[inherit] placeholder:text-text-tertiary caret-text-secondary"
                    value={text}
                    onChange={handleTextChange}
                    onKeyDown={handleKeyDown}
                    onPaste={handlePaste}
                    placeholder="Message…"
                    rows={1}
                    disabled={disabled}
                />

                {/* Action bar — bottom part */}
                <div className="flex items-center gap-1 px-1.5 pb-1.5">
                    {/* Attach button */}
                    <button
                        className={actionBtnClass}
                        onClick={() => fileInputRef.current?.click()}
                        disabled={disabled}
                        title="Attach file"
                    >
                        <Plus size={16} />
                    </button>

                    {/* Model selector */}
                    {onModelChange && modelLabel && (
                        <div className="relative" ref={modelMenuRef}>
                            <button
                                className="flex items-center gap-1 px-1.5 py-1 rounded-md text-[11px] text-text-tertiary bg-transparent border-none cursor-pointer transition-colors hover:text-text-secondary hover:bg-white/[0.05]"
                                onClick={() => setIsModelMenuOpen(v => !v)}
                                type="button"
                                title={modelLabel}
                            >
                                <ChevronUp size={12} className={`transition-transform duration-150 ${isModelMenuOpen ? 'rotate-180' : ''}`} />
                                <span>{modelLabel.replace(/^Gemini\s*/i, '')}</span>
                            </button>

                            {isModelMenuOpen && (
                                <>
                                    <div className="fixed inset-0 z-[299]" onClick={() => setIsModelMenuOpen(false)} />
                                    <div className="absolute bottom-full left-0 mb-1 z-popover min-w-[180px] bg-[#1F1F1F] border border-white/10 rounded-lg shadow-xl py-1 animate-in fade-in slide-in-from-bottom-1 duration-150">
                                        {MODEL_REGISTRY.map(m => (
                                            <button
                                                key={m.id}
                                                className={`w-full text-left px-3 py-1.5 text-[12px] bg-transparent border-none cursor-pointer flex items-center gap-2 transition-colors ${m.id === activeModel
                                                    ? 'text-text-primary bg-white/[0.08]'
                                                    : 'text-text-secondary hover:text-text-primary hover:bg-white/[0.05]'
                                                    }`}
                                                onClick={() => { onModelChange(m.id); setIsModelMenuOpen(false); }}
                                            >
                                                <span className="flex-1">{m.label}</span>
                                                {m.id === activeModel && <Check size={13} className="text-green-400" />}
                                            </button>
                                        ))}
                                    </div>
                                </>
                            )}
                        </div>
                    )}

                    {/* Spacer */}
                    <div className="flex-1" />

                    {/* Send / Stop button */}
                    {isStreaming ? (
                        <button
                            className={`${actionBtnClass} !text-[var(--danger-color,#cc0000)] hover:!bg-red-500/10`}
                            onClick={onStop}
                            title="Stop generation"
                        >
                            <Square size={12} fill="currentColor" strokeWidth={0} className="rounded-[2px]" />
                        </button>
                    ) : (
                        <button
                            className={`${actionBtnClass} ${canSend && !disabled ? '!text-text-primary' : ''}`}
                            onClick={handleSend}
                            disabled={disabled || !canSend}
                            title={isAnyUploading ? 'Waiting for uploads…' : 'Send'}
                        >
                            {isAnyUploading ? (
                                <Loader2 size={16} className="animate-spin" />
                            ) : (
                                <Send size={16} />
                            )}
                        </button>
                    )}
                </div>
            </div>

            <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="image/*,audio/*,video/*,application/pdf,text/*"
                style={{ display: 'none' }}
                onChange={(e) => handleFileSelect(e.target.files)}
            />
        </div>
    );
};
