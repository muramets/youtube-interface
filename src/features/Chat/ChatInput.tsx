// =============================================================================
// AI CHAT: Chat Input Component
// =============================================================================

import React, { useState, useRef, useCallback } from 'react';
import { Paperclip, Send, X, FileAudio, FileVideo, File, Image, Square, Loader2, Check, AlertCircle } from 'lucide-react';
import { getAttachmentType } from '../../core/services/aiService';
import type { StagedFile, ReadyAttachment } from '../../core/types/chatAttachment';
import { useChatStore } from '../../core/stores/chatStore';
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
}

export const ChatInput: React.FC<ChatInputProps> = ({
    onSend, onStop, disabled,
    stagedFiles, onAddFiles, onRemoveFile, isAnyUploading,
}) => {
    const isStreaming = useChatStore(s => s.isStreaming);
    const [text, setText] = useState('');
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const canSend = (text.trim() || stagedFiles.length > 0) && !isAnyUploading;

    const handleSend = useCallback(() => {
        const trimmed = text.trim();
        if (!trimmed && stagedFiles.length === 0) return;
        if (isAnyUploading) return;

        const readyAttachments = stagedFiles
            .filter((f): f is StagedFile & { result: ReadyAttachment } => f.status === 'ready' && !!f.result)
            .map((f) => f.result);

        onSend(trimmed, readyAttachments.length > 0 ? readyAttachments : undefined);
        setText('');
        if (textareaRef.current) {
            textareaRef.current.style.height = 'auto';
        }
    }, [text, stagedFiles, isAnyUploading, onSend]);

    const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    }, [handleSend]);

    const MAX_INPUT_HEIGHT = 120;

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

    const baseBtnClass = "shrink-0 w-9 h-9 rounded-lg border border-border flex items-center justify-center cursor-pointer transition-colors duration-100 text-text-secondary bg-button-secondary-bg hover:bg-button-secondary-hover hover:text-text-primary disabled:opacity-30 disabled:cursor-not-allowed";

    return (
        <div className="p-2.5 border-t border-border bg-card-bg shrink-0">
            {/* Staged attachment previews */}
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

            <div className="flex items-end gap-1.5">
                <button
                    className={baseBtnClass}
                    onClick={() => fileInputRef.current?.click()}
                    disabled={disabled}
                    title="Attach file"
                >
                    <Paperclip size={18} />
                </button>

                <textarea
                    ref={textareaRef}
                    className="chat-input-textarea flex-1 resize-none border border-border rounded-[10px] py-2 px-3 text-[13px] leading-snug max-h-[120px] overflow-hidden bg-input-bg text-text-primary outline-none transition-colors duration-100 font-[inherit] focus:border-text-tertiary placeholder:text-text-tertiary caret-text-secondary"
                    value={text}
                    onChange={handleTextChange}
                    onKeyDown={handleKeyDown}
                    onPaste={handlePaste}
                    placeholder="Message…"
                    rows={1}
                    disabled={disabled}
                />

                {isStreaming ? (
                    <button
                        className={`${baseBtnClass} !bg-[var(--danger-color,#cc0000)] !text-white !border-transparent hover:!brightness-90 transition-all`}
                        onClick={onStop}
                        title="Stop generation"
                    >
                        <Square size={16} />
                    </button>
                ) : (
                    <button
                        className={`${baseBtnClass} !bg-text-primary !text-[var(--video-edit-bg,var(--bg-primary))] !border-transparent hover:!brightness-90 transition-all`}
                        onClick={handleSend}
                        disabled={disabled || !canSend}
                        title={isAnyUploading ? 'Waiting for uploads…' : 'Send'}
                    >
                        {isAnyUploading ? (
                            <Loader2 size={18} className="animate-spin" />
                        ) : (
                            <Send size={18} />
                        )}
                    </button>
                )}
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
