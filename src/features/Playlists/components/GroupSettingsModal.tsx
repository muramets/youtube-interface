import { useState, useEffect } from 'react';
import type { FormEvent } from 'react';
import { Trash2 } from 'lucide-react';
import { createPortal } from 'react-dom';
import { Button } from '../../../components/ui/atoms/Button';

interface GroupSettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
    groupName: string | null; // null = create mode
    onSave: (name: string, originalName: string | null) => Promise<void>;
    onDelete?: (groupName: string) => Promise<void>;
}

export function GroupSettingsModal({
    isOpen,
    onClose,
    groupName,
    onSave,
    onDelete
}: GroupSettingsModalProps) {
    const isCreateMode = groupName === null;
    const [name, setName] = useState(groupName || '');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

    // Sync state with props when modal opens or group changes
    useEffect(() => {
        if (isOpen) {
            setName(groupName || '');
            setShowDeleteConfirm(false);
        }
    }, [isOpen, groupName]);

    // Handle ESC key
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && isOpen) {
                onClose();
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, onClose]);

    const hasChanges = name.trim() !== '' && (isCreateMode || name.trim() !== groupName);

    const handleSubmit = async (e?: FormEvent) => {
        if (e) e.preventDefault();
        if (!hasChanges || isSubmitting) return;

        setIsSubmitting(true);
        try {
            await onSave(name.trim(), groupName);
            onClose();
        } catch (error) {
            console.error('Failed to save group:', error);
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDelete = async () => {
        if (!groupName || !onDelete || isSubmitting) return;

        setIsSubmitting(true);
        try {
            await onDelete(groupName);
            onClose();
        } catch (error) {
            console.error('Failed to delete group:', error);
        } finally {
            setIsSubmitting(false);
        }
    };

    if (!isOpen) return null;

    return createPortal(
        <div className="fixed inset-0 z-[1001] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in">
            {/* Backdrop click handler is now implicit on the container if we want, or we can use a wrapper. 
                CreatePlaylistModal uses a single container for alignment and bg. 
                However, to handle clicks strictly on the backdrop and not the modal, 
                we usually need a check or separate elements.
                
                Looking at CreatePlaylistModal again from context:
                It doesn't seem to have an explicit onBackdropClick in the earlier snippet? 
                Wait, I saw `onClick={onClose}` on the close button, but didn't see it on the container.
                
                Let's stick to the structure that works reliably:
                Container covers screen with BG.
                Modal is inside.
                We need to close when clicking BG.
            */}

            {/* Click handler for backdrop */}
            <div className="absolute inset-0" onClick={onClose} />

            {/* Modal */}
            <div className="relative bg-bg-secondary border border-border rounded-xl shadow-2xl w-full max-w-md mx-4 animate-scale-in z-10">
                {/* Header */}
                <div className="px-6 py-4 border-b border-border">
                    <h2 className="text-lg font-bold text-text-primary">
                        {isCreateMode ? 'Create Group' : 'Edit Group'}
                    </h2>
                </div>

                {/* Content */}
                <form id="group-form" onSubmit={handleSubmit} className="p-6">
                    <div className="flex flex-col gap-2">
                        <label className="text-xs font-medium text-secondary uppercase tracking-wide">
                            Group Name
                        </label>
                        <div className="relative flex flex-col bg-bg-secondary border border-border rounded-lg p-3 transition-colors hover:border-text-primary focus-within:border-text-primary">
                            <input
                                type="text"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                placeholder="e.g. Music, Tutorials, Research"
                                className="w-full bg-transparent text-primary placeholder:text-secondary/50 outline-none"
                                autoFocus
                                required
                            />
                        </div>
                    </div>
                </form>

                {/* Footer */}
                <div className="px-6 py-4 border-t border-border flex items-center justify-between">
                    {/* Delete Button (only for edit mode) */}
                    <div>
                        {!isCreateMode && onDelete && (
                            <button
                                type="button"
                                onClick={showDeleteConfirm ? handleDelete : () => setShowDeleteConfirm(true)}
                                onBlur={() => setShowDeleteConfirm(false)}
                                disabled={isSubmitting}
                                className={`
                                    transition-all duration-200 ease-in-out flex items-center gap-2 rounded-lg text-sm font-medium
                                    ${showDeleteConfirm
                                        ? 'bg-red-500/10 text-red-500 px-3 py-1.5 ring-2 ring-red-500/20'
                                        : 'p-2 text-secondary hover:text-red-500 hover:bg-red-500/10'
                                    }
                                `}
                                title={showDeleteConfirm ? 'Double click to confirm' : 'Delete Group'}
                            >
                                {showDeleteConfirm ? (
                                    <span>Confirm?</span>
                                ) : (
                                    <Trash2 className="w-4 h-4" />
                                )}
                            </button>
                        )}
                    </div>

                    {/* Action Buttons */}
                    <div className="flex items-center gap-2">
                        <Button
                            variant="secondary"
                            onClick={onClose}
                        >
                            Cancel
                        </Button>
                        <Button
                            variant="primary"
                            type="submit"
                            form="group-form"
                            disabled={!hasChanges || isSubmitting}
                            onClick={() => handleSubmit()}
                        >
                            {isCreateMode ? 'Create' : 'Save'}
                        </Button>
                    </div>
                </div>
            </div>
        </div>,
        document.body
    );
}
