// =============================================================================
// CREATE NAME MODAL — Shared UI Molecule
// =============================================================================
// Generic "enter a name" modal used for creating playlists, groups, etc.
// Supports: title, name input, optional group selector, Enter/Escape keys.
// Pure presentational — no business logic or store coupling.
// =============================================================================

import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { Button } from '../atoms/Button';

interface CreateNameModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: (name: string, group?: string) => void;
    /** Modal title, e.g. "New Playlist" or "Create Group" */
    title: string;
    /** Input placeholder, e.g. "Enter playlist name..." */
    placeholder?: string;
    /** Label for the name field */
    nameLabel?: string;
    /** Confirm button label */
    confirmLabel?: string;
    /** Optional list of existing groups to show a group selector */
    existingGroups?: string[];
    /** Label for the group selector */
    groupLabel?: string;
    /** Placeholder for "no group" option */
    groupPlaceholder?: string;
}

export const CreateNameModal: React.FC<CreateNameModalProps> = ({
    isOpen,
    onClose,
    onConfirm,
    title,
    placeholder = 'Enter name...',
    nameLabel = 'Name',
    confirmLabel = 'Create',
    existingGroups,
    groupLabel = 'Group',
    groupPlaceholder = 'No group',
}) => {
    const [name, setName] = useState('');
    const [group, setGroup] = useState('');
    const inputRef = useRef<HTMLInputElement>(null);

    // Reset state when modal opens — legitimate prop-driven reset
    /* eslint-disable react-hooks/set-state-in-effect */
    useEffect(() => {
        if (isOpen) {
            setName('');
            setGroup('');
            requestAnimationFrame(() => inputRef.current?.focus());
        }
    }, [isOpen]);
    /* eslint-enable react-hooks/set-state-in-effect */

    const handleSubmit = () => {
        const trimmed = name.trim();
        if (!trimmed) return;
        onConfirm(trimmed, group.trim() || undefined);
        onClose();
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') handleSubmit();
        if (e.key === 'Escape') onClose();
    };

    if (!isOpen) return null;

    return createPortal(
        <div
            className="fixed inset-0 z-modal flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in"
            onClick={onClose}
        >
            <div
                className="bg-bg-secondary rounded-xl flex flex-col overflow-hidden animate-scale-in border border-border shadow-2xl w-[380px] max-w-[90vw]"
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className="px-6 py-4 flex items-center justify-between border-b border-border">
                    <h2 className="text-lg font-bold text-text-primary m-0">{title}</h2>
                    <button
                        onClick={onClose}
                        className="bg-transparent border-none text-text-primary cursor-pointer hover:opacity-70 transition-opacity"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Body */}
                <div className="p-6 space-y-4">
                    {/* Name — TitleInput pattern from Details/Packaging */}
                    <div className="relative flex flex-col bg-bg-secondary border border-border rounded-lg p-3 transition-colors hover:border-text-primary focus-within:border-text-primary">
                        <label className="text-xs text-text-secondary font-medium tracking-wider uppercase mb-2">
                            {nameLabel}
                        </label>
                        <input
                            ref={inputRef}
                            type="text"
                            value={name}
                            onChange={e => setName(e.target.value)}
                            onKeyDown={handleKeyDown}
                            placeholder={placeholder}
                            className="w-full bg-transparent text-base text-text-primary outline-none placeholder-text-tertiary"
                        />
                    </div>

                    {/* Group (optional) */}
                    {existingGroups && existingGroups.length > 0 && (
                        <div className="relative flex flex-col bg-bg-secondary border border-border rounded-lg p-3 transition-colors hover:border-text-primary focus-within:border-text-primary">
                            <label className="text-xs text-text-secondary font-medium tracking-wider uppercase mb-2">
                                {groupLabel} <span className="text-text-tertiary normal-case tracking-normal">(optional)</span>
                            </label>
                            <select
                                value={group}
                                onChange={e => setGroup(e.target.value)}
                                onKeyDown={handleKeyDown}
                                className="w-full bg-transparent text-base text-text-primary outline-none cursor-pointer"
                            >
                                <option value="">{groupPlaceholder}</option>
                                {existingGroups.map(g => (
                                    <option key={g} value={g}>{g}</option>
                                ))}
                            </select>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="px-6 py-4 flex justify-end gap-3 border-t border-border bg-bg-secondary/30">
                    <Button variant="secondary" onClick={onClose}>
                        Cancel
                    </Button>
                    <Button
                        variant="primary"
                        onClick={handleSubmit}
                        disabled={!name.trim()}
                    >
                        {confirmLabel}
                    </Button>
                </div>
            </div>
        </div>,
        document.body
    );
};
