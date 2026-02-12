// =============================================================================
// GROUP SETTINGS MODAL — Playlists Feature
// =============================================================================
// Dual-mode modal for groups:
//   - Create mode (groupName === null): delegates to shared CreateNameModal
//   - Edit mode (groupName !== null): inline edit form with delete support
// =============================================================================

import { useState, useEffect } from 'react';
import type { FormEvent } from 'react';
import { Trash2 } from 'lucide-react';
import { createPortal } from 'react-dom';
import { Button } from '../../../components/ui/atoms/Button';
import { CreateNameModal } from '../../../components/ui/molecules/CreateNameModal';

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

    // ---------- CREATE MODE: delegate to shared CreateNameModal ----------
    if (isCreateMode) {
        return (
            <CreateNameModal
                isOpen={isOpen}
                onClose={onClose}
                onConfirm={(name) => onSave(name, null)}
                title="Create Group"
                placeholder="e.g. Music, Tutorials, Research"
                nameLabel="Group Name"
                confirmLabel="Create"
            />
        );
    }

    // ---------- EDIT MODE: keep original inline form ----------
    return (
        <EditGroupModalInner
            isOpen={isOpen}
            onClose={onClose}
            groupName={groupName}
            onSave={onSave}
            onDelete={onDelete}
        />
    );
}

// Extracted edit-mode into a sub-component to avoid hooks-after-early-return issues
function EditGroupModalInner({
    isOpen,
    onClose,
    groupName,
    onSave,
    onDelete,
}: {
    isOpen: boolean;
    onClose: () => void;
    groupName: string;
    onSave: (name: string, originalName: string | null) => Promise<void>;
    onDelete?: (groupName: string) => Promise<void>;
}) {
    const [name, setName] = useState(groupName || '');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

    useEffect(() => {
        if (isOpen) {
            setName(groupName || '');
            setShowDeleteConfirm(false);
        }
    }, [isOpen, groupName]);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && isOpen) onClose();
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, onClose]);

    const hasChanges = name.trim() !== '' && name.trim() !== groupName;

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
            <div className="absolute inset-0" onClick={onClose} />
            <div className="relative bg-bg-secondary border border-border rounded-xl shadow-2xl w-full max-w-md mx-4 animate-scale-in z-10">
                {/* Header */}
                <div className="px-6 py-4 border-b border-border">
                    <h2 className="text-lg font-bold text-text-primary">Edit Group</h2>
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
                    {/* Delete Button */}
                    <div>
                        {onDelete && (
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
                        <Button variant="secondary" onClick={onClose}>
                            Cancel
                        </Button>
                        <Button
                            variant="primary"
                            type="submit"
                            form="group-form"
                            disabled={!hasChanges || isSubmitting}
                            onClick={() => handleSubmit()}
                        >
                            Save
                        </Button>
                    </div>
                </div>
            </div>
        </div>,
        document.body
    );
}
