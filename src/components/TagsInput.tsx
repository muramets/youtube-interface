import React, { useState, useRef } from 'react';
import { X, Copy, Trash2 } from 'lucide-react';
import { PortalTooltip } from './Shared/PortalTooltip';

interface TagsInputProps {
    tags: string[];
    onChange: (tags: string[]) => void;
    onShowToast?: (message: string, type: 'success' | 'error') => void;
    readOnly?: boolean;
}

export const TagsInput: React.FC<TagsInputProps> = ({ tags, onChange, onShowToast, readOnly = false }) => {
    const [input, setInput] = useState('');
    const inputRef = useRef<HTMLInputElement>(null);

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault();
            addTag();
        } else if (e.key === 'Backspace' && !input && tags.length > 0) {
            removeTag(tags.length - 1);
        }
    };

    const addTag = () => {
        const trimmedInput = input.trim();
        if (trimmedInput && !tags.includes(trimmedInput)) {
            onChange([...tags, trimmedInput]);
            setInput('');
        }
    };

    const removeTag = (index: number) => {
        onChange(tags.filter((_, i) => i !== index));
    };

    const handleCopyAll = () => {
        const cleanTags = tags.map(tag => tag.replace(/^#/, ''));
        navigator.clipboard.writeText(cleanTags.join(', '));
        if (onShowToast) {
            onShowToast('Tags copied to clipboard', 'success');
        }
    };

    const handleDeleteAll = () => {
        onChange([]);
    };

    const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
        e.preventDefault();
        const pastedData = e.clipboardData.getData('text');
        if (!pastedData) return;

        const newTags = pastedData
            .split(',')
            .map(tag => tag.trim())
            .filter(tag => tag.length > 0);

        if (newTags.length > 0) {
            // Filter out duplicates that already exist or are in the pasted list multiple times
            const uniqueNewTags = [...new Set(newTags)].filter(tag => !tags.includes(tag));

            if (uniqueNewTags.length > 0) {
                onChange([...tags, ...uniqueNewTags]);
            }
        }
    };

    return (
        <div className="flex flex-col gap-2">
            <div className="flex justify-between items-center h-5">
                <label className="text-xs text-text-secondary font-medium tracking-wider uppercase">Tags</label>
                <div className={`flex gap-2 transition-opacity duration-200 ${tags.length > 0 && !readOnly ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
                    <PortalTooltip content="Copy all tags" align="center" enterDelay={500}>
                        <button
                            onClick={handleCopyAll}
                            className="text-text-secondary hover:text-text-primary transition-colors p-1 rounded hover:bg-white/10"
                        >
                            <Copy size={14} />
                        </button>
                    </PortalTooltip>
                    <PortalTooltip content="Remove all tags" align="center" enterDelay={500}>
                        <button
                            onClick={handleDeleteAll}
                            className="text-text-secondary hover:text-red-500 transition-colors p-1 rounded hover:bg-white/10"
                        >
                            <Trash2 size={14} />
                        </button>
                    </PortalTooltip>
                </div>
            </div>

            <div
                className={`bg-bg-secondary border border-border rounded-lg p-2 min-h-[46px] flex flex-wrap content-start gap-2 transition-colors ${readOnly ? 'opacity-60 cursor-default' : 'cursor-text hover:border-text-primary focus-within:border-text-primary'}`}
                onClick={() => !readOnly && inputRef.current?.focus()}
            >
                {tags.map((tag, index) => (
                    <div key={index} className="bg-[#3F3F3F] text-white text-sm px-3 py-1.5 rounded-full flex items-center gap-1.5 animate-scale-in">
                        <span>{tag}</span>
                        {!readOnly && (
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    removeTag(index);
                                }}
                                className="hover:text-red-400 transition-colors flex items-center justify-center"
                            >
                                <X size={14} />
                            </button>
                        )}
                    </div>
                ))}
                {!readOnly && (
                    <input
                        ref={inputRef}
                        type="text"
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={handleKeyDown}
                        onPaste={handlePaste}
                        onBlur={addTag}
                        className="bg-transparent border-none outline-none text-text-primary flex-1 min-w-[120px] h-[32px] placeholder-[#717171]"
                        placeholder={tags.length === 0 ? "Add tags..." : ""}
                    />
                )}
            </div>
        </div>
    );
};
