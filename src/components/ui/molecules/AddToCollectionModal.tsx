// =============================================================================
// ADD TO COLLECTION MODAL — Shared UI Molecule
// =============================================================================
// Generic "add item to a collection" modal with toggle checkboxes and inline
// creation. Used for both video playlists and music playlists.
// Pure presentational — no business logic or store coupling.
// =============================================================================

import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X, Plus, Check } from 'lucide-react';
import { Button } from '../atoms/Button';

/** A single collection item to display in the list */
export interface CollectionItem {
    id: string;
    name: string;
    /** Whether the target item(s) are in this collection */
    isMember: boolean;
    /** Optional color for the indicator */
    color?: string;
    /** Optional icon element to show before the name */
    icon?: React.ReactNode;
}

interface AddToCollectionModalProps {
    isOpen: boolean;
    onClose: () => void;
    /** Modal title, e.g. "Save to playlist" */
    title?: string;
    /** List of collections to display */
    items: CollectionItem[];
    /** Called when user toggles membership for an item */
    onToggle: (itemId: string, currentlyMember: boolean) => void;
    /** Called when user creates a new collection inline */
    onCreate: (name: string) => void;
    /** Label for the "create new" button */
    createLabel?: string;
    /** Placeholder for the inline create input */
    createPlaceholder?: string;
    /** Empty state text */
    emptyText?: string;
}

export const AddToCollectionModal: React.FC<AddToCollectionModalProps> = ({
    isOpen,
    onClose,
    title = 'Save to playlist',
    items,
    onToggle,
    onCreate,
    createLabel = 'Create new playlist',
    createPlaceholder = 'Name',
    emptyText = 'No playlists yet',
}) => {
    const [isCreating, setIsCreating] = useState(false);
    const [newName, setNewName] = useState('');
    const newInputRef = useRef<HTMLInputElement>(null);

    // Reset state when modal opens — legitimate prop-driven reset
    /* eslint-disable react-hooks/set-state-in-effect */
    useEffect(() => {
        if (isOpen) {
            setNewName('');
            setIsCreating(false);
        }
    }, [isOpen]);
    /* eslint-enable react-hooks/set-state-in-effect */

    useEffect(() => {
        if (isCreating) {
            setTimeout(() => newInputRef.current?.focus(), 100);
        }
    }, [isCreating]);

    const handleCreate = () => {
        const trimmed = newName.trim();
        if (!trimmed) return;
        onCreate(trimmed);
        setNewName('');
        setIsCreating(false);
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        e.stopPropagation();
        if (e.key === 'Enter') handleCreate();
        if (e.key === 'Escape') setIsCreating(false);
    };

    if (!isOpen) return null;

    return createPortal(
        <div
            className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in"
            onClick={onClose}
        >
            <div
                className="bg-bg-secondary rounded-xl w-[400px] max-w-[90vw] max-h-[80vh] flex flex-col overflow-hidden animate-scale-in border border-border shadow-2xl"
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className="px-4 py-4 flex items-center justify-between border-b border-border">
                    <h3 className="m-0 text-base font-bold text-text-primary">{title}</h3>
                    <button
                        onClick={onClose}
                        className="bg-transparent border-none text-text-primary cursor-pointer hover:opacity-70 transition-opacity"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Collection list */}
                <div className="flex-1 overflow-y-auto py-2 custom-scrollbar">
                    {items.length === 0 && !isCreating && (
                        <div className="px-4 py-4 text-text-tertiary text-sm text-center">
                            {emptyText}
                        </div>
                    )}

                    {items.map(item => (
                        <div
                            key={item.id}
                            className="px-4 py-2 flex items-center gap-3 cursor-pointer hover:bg-hover-bg transition-colors"
                            onClick={() => onToggle(item.id, item.isMember)}
                        >
                            {/* Checkbox */}
                            <div className={`w-5 h-5 border border-text-secondary rounded flex items-center justify-center shrink-0 transition-colors ${item.isMember ? 'bg-text-primary border-text-primary' : 'bg-transparent'
                                }`}>
                                {item.isMember && <Check size={14} className="text-bg-primary" />}
                            </div>

                            {/* Optional icon */}
                            {item.icon && (
                                <span className="shrink-0">{item.icon}</span>
                            )}

                            {/* Name */}
                            <span className="text-text-primary text-sm flex-1 truncate">{item.name}</span>
                        </div>
                    ))}
                </div>

                {/* Inline create */}
                <div className="p-4 border-t border-border">
                    {!isCreating ? (
                        <button
                            onClick={() => setIsCreating(true)}
                            className="bg-transparent border-none text-text-secondary cursor-pointer flex items-center gap-2 text-sm font-medium hover:text-text-primary transition-colors"
                        >
                            <Plus size={20} />
                            {createLabel}
                        </button>
                    ) : (
                        <form onSubmit={(e) => { e.preventDefault(); handleCreate(); }} className="flex flex-col gap-3">
                            <input
                                ref={newInputRef}
                                type="text"
                                placeholder={createPlaceholder}
                                value={newName}
                                onChange={e => setNewName(e.target.value)}
                                className="p-2 rounded border border-border bg-bg-secondary text-text-primary outline-none focus:border-text-primary transition-colors"
                                onKeyDown={handleKeyDown}
                            />
                            <div className="flex justify-end">
                                <Button
                                    variant="primary"
                                    size="sm"
                                    type="submit"
                                    disabled={!newName.trim()}
                                >
                                    Create
                                </Button>
                            </div>
                        </form>
                    )}
                </div>
            </div>
        </div>,
        document.body
    );
};
