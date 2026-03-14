// =============================================================================
// AI CHAT: Chat Input Component
// =============================================================================

import React, { useState, useMemo, useRef, useCallback, useLayoutEffect } from 'react';
import { Plus, Send, X, FileAudio, FileVideo, File, Image, Square, Loader2, Check, AlertCircle, ChevronUp, Pencil, Link, Unlink, Brain } from 'lucide-react';
import { MODEL_REGISTRY, getAcceptedMimeTypes, type ThinkingOption } from '../../core/types/chat/chat';
import { getAttachmentType, isAllowedMimeTypeForModel } from '../../core/services/ai/aiService';
import type { StagedFile, ReadyAttachment } from '../../core/types/chat/chatAttachment';
import { estimateImageTokens } from '../../../shared/imageTokens';
import { useChatStore } from '../../core/stores/chat/chatStore';
import { useUIStore } from '../../core/stores/uiStore';
import { useShallow } from 'zustand/react/shallow';
import { useAppContextStore, selectAllItems } from '../../core/stores/appContextStore';
import { ContextAccordion } from './components/ContextAccordion';
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
    editingMessage?: import('../../core/types/chat/chat').ChatMessage | null;
    onCancelEdit?: () => void;
    onEditSend?: (newText: string, attachments?: ReadyAttachment[]) => void;
}



/** Small toggle button for pausing/resuming context collection (global) */
const ContextBridgeToggle: React.FC = () => {
    const paused = useAppContextStore((s) => s.isBridgePaused);
    const toggle = useAppContextStore((s) => s.toggleBridgePause);

    return (
        <PortalTooltip content={paused ? 'Context link paused' : 'Context link active'}>
            <button
                className={`shrink-0 w-7 h-7 rounded-md flex items-center justify-center cursor-pointer transition-colors duration-100 bg-transparent border-none ${paused
                    ? 'text-amber-400/70 hover:text-amber-300 hover:bg-amber-500/10'
                    : 'text-emerald-400/70 hover:text-emerald-300 hover:bg-emerald-500/10'
                    }`}
                onClick={toggle}
                type="button"
            >
                {paused ? <Unlink size={14} /> : <Link size={14} />}
            </button>
        </PortalTooltip>
    );
};

export const ChatInput: React.FC<ChatInputProps> = ({
    onSend, onStop, disabled,
    stagedFiles, onAddFiles, onRemoveFile, isAnyUploading,
    modelLabel, activeModel, onModelChange,
    editingMessage, onCancelEdit, onEditSend,
}) => {
    const isStreaming = useChatStore(s => s.isStreaming);
    const contextItems = useAppContextStore(useShallow(selectAllItems));
    const removeContextItem = useAppContextStore(s => s.removeItem);
    const clearAllContext = useAppContextStore(s => s.clearAll);

    const [text, setText] = useState('');
    const [isModelMenuOpen, setIsModelMenuOpen] = useState(false);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const modelMenuRef = useRef<HTMLDivElement>(null);
    const thinkingMenuRef = useRef<HTMLDivElement>(null);
    const prevEditingRef = useRef(editingMessage);

    // Thinking level state from store
    const pendingThinkingOptionId = useChatStore(s => s.pendingThinkingOptionId);
    const setPendingThinkingOptionId = useChatStore(s => s.setPendingThinkingOptionId);
    const [isThinkingMenuOpen, setIsThinkingMenuOpen] = useState(false);

    // Resolve thinking options for the active model
    const thinkingConfig = useMemo(() => {
        const model = MODEL_REGISTRY.find(m => m.id === activeModel);
        if (!model) return null;
        const activeOptionId = pendingThinkingOptionId ?? model.thinkingDefault;
        const activeOption = model.thinkingOptions.find(o => o.id === activeOptionId) ?? model.thinkingOptions[0];
        return { options: model.thinkingOptions, activeOption, defaultId: model.thinkingDefault };
    }, [activeModel, pendingThinkingOptionId]);

    // Attachment support for active model
    const activeModelConfig = useMemo(() => MODEL_REGISTRY.find(m => m.id === activeModel), [activeModel]);
    const acceptedFileTypes = useMemo(
        () => activeModelConfig ? getAcceptedMimeTypes(activeModelConfig.attachmentSupport) : 'image/*,audio/*,video/*,application/pdf,text/*',
        [activeModelConfig],
    );
    const hasUnsupportedFiles = useMemo(() => {
        if (!activeModelConfig || stagedFiles.length === 0) return false;
        const support = activeModelConfig.attachmentSupport;
        return stagedFiles.some(f => f.result && !isAllowedMimeTypeForModel(f.file, support));
    }, [activeModelConfig, stagedFiles]);

    // Warn when a text file uses >30% of the model's context window
    const largeTextWarning = useMemo(() => {
        if (!activeModelConfig || stagedFiles.length === 0) return null;
        const threshold = activeModelConfig.contextLimit * 0.3;
        for (const f of stagedFiles) {
            if (f.file.type.startsWith('text/')) {
                const estimatedTokens = Math.ceil(f.file.size / 4);
                if (estimatedTokens > threshold) {
                    const percent = Math.round((estimatedTokens / activeModelConfig.contextLimit) * 100);
                    return { fileName: f.file.name, percent };
                }
            }
        }
        return null;
    }, [activeModelConfig, stagedFiles]);

    // Memorize mode state
    const [isMemorizing, setIsMemorizing] = useState(false);
    const [isMemorizeSaving, setIsMemorizeSaving] = useState(false);
    const memorizeConversation = useChatStore(s => s.memorizeConversation);
    const activeConversationId = useChatStore(s => s.activeConversationId);
    const messages = useChatStore(s => s.messages);
    const showToast = useUIStore(s => s.showToast);

    // Sync text with editingMessage changes synchronously during render
    // (standard "store previous props" pattern — ref access during render is intentional)
    if (editingMessage !== prevEditingRef.current) {
        prevEditingRef.current = editingMessage;
        if (editingMessage) {
            setText(editingMessage.text);
        }
    }

    const canSend = (text.trim() || stagedFiles.length > 0) && !isAnyUploading && !hasUnsupportedFiles;

    // Auto-resize and focus textarea when editing starts
    useLayoutEffect(() => {
        if (editingMessage) {
            requestAnimationFrame(() => {
                const el = textareaRef.current;
                if (el) {
                    el.style.height = 'auto';
                    el.style.height = Math.min(el.scrollHeight, 80) + 'px';
                    el.focus();
                }
            });
        }
    }, [editingMessage]);


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

    const handleMemorizeSend = useCallback(async () => {
        setIsMemorizeSaving(true);
        try {
            const guidance = text.trim() || undefined;
            await memorizeConversation(guidance);
            setIsMemorizing(false);
            setText('');
            if (textareaRef.current) textareaRef.current.style.height = 'auto';
            // No toast — AI response in chat shows results (KI + Memory tool call badges)
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Unknown error';
            console.error('[ChatInput] memorize failed:', message, { conversationId: activeConversationId });
            showToast('Failed to save memory', 'error');
            setIsMemorizing(false);
        } finally {
            setIsMemorizeSaving(false);
        }
    }, [text, memorizeConversation, showToast, activeConversationId]);

    const handleCancelMemorize = useCallback(() => {
        setIsMemorizing(false);
        setText('');
        if (textareaRef.current) textareaRef.current.style.height = 'auto';
    }, []);

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
        el.style.height = Math.min(el.scrollHeight, 80) + 'px';
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

            {/* Context chips — collapsible accordion */}
            {contextItems.length > 0 && (
                <div className="mb-2">
                    <ContextAccordion
                        items={contextItems}
                        onRemoveItem={(item) => removeContextItem(i => i === item)}
                        onClearAll={() => clearAllContext()}
                        defaultExpanded
                    />
                </div>
            )}
            {stagedFiles.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-2">
                    {stagedFiles.map((staged) => {
                        const type = getAttachmentType(staged.file.type);
                        // Estimate image tokens for the active model
                        const imageTokenEstimate = type === 'image' && activeModel
                            ? estimateImageTokens(activeModel, [{ width: staged.width, height: staged.height }])
                            : 0;
                        const textTokenEstimate = staged.file.type.startsWith('text/')
                            ? Math.ceil(staged.file.size / 4)
                            : 0;
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
                                {(imageTokenEstimate > 0 || textTokenEstimate > 0) && (
                                    <span className="text-text-tertiary">~{(imageTokenEstimate || textTokenEstimate).toLocaleString()} tokens</span>
                                )}
                                <button className="bg-transparent border-none p-1 rounded text-text-tertiary cursor-pointer flex text-sm leading-none hover:bg-hover-bg hover:text-[var(--danger-color,#cc0000)] transition-colors" onClick={() => onRemoveFile(staged.id)} title="Remove">
                                    <X size={12} />
                                </button>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Unsupported files warning */}
            {hasUnsupportedFiles && activeModelConfig && (
                <div className="flex items-center gap-1.5 px-3 py-1.5 mb-1.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs text-amber-400">
                    <AlertCircle size={12} />
                    <span>Some files are not supported by {activeModelConfig.label}. Remove them to send.</span>
                </div>
            )}

            {/* Large text file warning */}
            {largeTextWarning && (
                <div className="flex items-center gap-1.5 px-3 py-1.5 mb-1.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs text-amber-400">
                    <AlertCircle size={12} />
                    <span>{largeTextWarning.fileName} uses ~{largeTextWarning.percent}% of context window. Response quality may decrease.</span>
                </div>
            )}

            {/* Unified input container */}
            <div
                className={`border rounded-xl transition-colors duration-200 ${isMemorizing ? 'border-accent' : 'border-border bg-input-bg focus-within:border-text-tertiary'}`}
                style={isMemorizing ? { backgroundColor: 'color-mix(in srgb, var(--accent) 15%, var(--input-bg))' } : undefined}
            >
                {/* Textarea — top part */}
                <textarea
                    ref={textareaRef}
                    className="chat-input-textarea w-full resize-none border-none rounded-t-xl pt-1.5 pb-2 px-3.5 text-[13px] leading-snug max-h-[80px] overflow-y-auto bg-transparent text-text-primary outline-none font-[inherit] placeholder:text-text-tertiary caret-text-secondary"
                    value={text}
                    onChange={handleTextChange}
                    onKeyDown={handleKeyDown}
                    onPaste={handlePaste}
                    placeholder={isMemorizing ? 'Focus: e.g. "remember our thumbnail strategy"...' : 'Message…'}
                    rows={1}
                    disabled={disabled || isMemorizeSaving}
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
                                <span>{modelLabel.replace(/^(?:Gemini|Claude)\s*/i, '')}</span>
                            </button>

                            {isModelMenuOpen && (
                                <>
                                    <div className="fixed inset-0 z-[299]" onClick={() => setIsModelMenuOpen(false)} />
                                    <div className="absolute bottom-full left-0 mb-1 z-popover min-w-[180px] bg-[#1F1F1F] border border-white/10 rounded-lg shadow-xl py-1 animate-in fade-in slide-in-from-bottom-1 duration-150">
                                        {(['gemini', 'anthropic'] as const).map(provider => {
                                            const group = MODEL_REGISTRY.filter(m => m.provider === provider);
                                            if (group.length === 0) return null;
                                            return (
                                                <React.Fragment key={provider}>
                                                    <div className="px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-text-tertiary select-none pointer-events-none">
                                                        {provider === 'gemini' ? 'Gemini' : 'Claude'}
                                                    </div>
                                                    {group.map(m => (
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
                                                </React.Fragment>
                                            );
                                        })}
                                    </div>
                                </>
                            )}
                        </div>
                    )}

                    {/* Thinking level toggle — hidden when model has no thinking support (single 'off' option) */}
                    {thinkingConfig && thinkingConfig.options.length > 1 && (
                        <div className="relative" ref={thinkingMenuRef}>
                            <button
                                className="flex items-center gap-1 px-1.5 py-1 rounded-md text-[11px] text-text-tertiary bg-transparent border-none cursor-pointer transition-colors hover:text-text-secondary hover:bg-white/[0.05]"
                                onClick={() => setIsThinkingMenuOpen(v => !v)}
                                type="button"
                                title={`Thinking: ${thinkingConfig.activeOption.label}`}
                            >
                                <Brain size={12} className={thinkingConfig.activeOption.id === 'off' ? 'opacity-40' : ''} />
                                <span>{thinkingConfig.activeOption.label}</span>
                            </button>

                            {isThinkingMenuOpen && (
                                <>
                                    <div className="fixed inset-0 z-[299]" onClick={() => setIsThinkingMenuOpen(false)} />
                                    <div className="absolute bottom-full left-0 mb-1 z-popover min-w-[140px] bg-[#1F1F1F] border border-white/10 rounded-lg shadow-xl py-1 animate-in fade-in slide-in-from-bottom-1 duration-150">
                                        {thinkingConfig.options.map((opt: ThinkingOption) => (
                                            <button
                                                key={opt.id}
                                                className={`w-full text-left px-3 py-1.5 text-[12px] bg-transparent border-none cursor-pointer flex items-center gap-2 transition-colors ${opt.id === thinkingConfig.activeOption.id
                                                    ? 'text-text-primary bg-white/[0.08]'
                                                    : 'text-text-secondary hover:text-text-primary hover:bg-white/[0.05]'
                                                    }`}
                                                onClick={() => {
                                                    setPendingThinkingOptionId(opt.id === thinkingConfig.defaultId ? null : opt.id);
                                                    setIsThinkingMenuOpen(false);
                                                }}
                                            >
                                                <span className="flex-1">{opt.label}</span>
                                                {opt.id === thinkingConfig.activeOption.id && <Check size={13} className="text-green-400" />}
                                            </button>
                                        ))}
                                    </div>
                                </>
                            )}
                        </div>
                    )}

                    {/* Spacer */}
                    <div className="flex-1" />

                    {/* Global context bridge toggle — pause/resume all bridges */}
                    <ContextBridgeToggle />

                    {/* Memorize toggle */}
                    {!editingMessage && activeConversationId && messages.length > 0 && (
                        <PortalTooltip content={isMemorizing ? "Cancel memorize" : "Memorize conversation"} enterDelay={1500}>
                            <button
                                className={`${actionBtnClass} ${isMemorizing ? '!text-accent !bg-accent/10' : ''}`}
                                onClick={() => isMemorizing ? handleCancelMemorize() : setIsMemorizing(true)}
                                disabled={disabled || isStreaming || isMemorizeSaving}
                            >
                                <Brain size={15} />
                            </button>
                        </PortalTooltip>
                    )}

                    {/* Send / Stop / Memorize-Submit button */}
                    {isMemorizing ? (
                        <button
                            className={`${actionBtnClass} !text-accent hover:!bg-accent/10`}
                            onClick={handleMemorizeSend}
                            disabled={isMemorizeSaving}
                        >
                            {isMemorizeSaving ? (
                                <Loader2 size={16} className="animate-spin" />
                            ) : (
                                <Check size={16} />
                            )}
                        </button>
                    ) : isStreaming ? (
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
                accept={acceptedFileTypes}
                style={{ display: 'none' }}
                onChange={(e) => handleFileSelect(e.target.files)}
            />
        </div>
    );
};
