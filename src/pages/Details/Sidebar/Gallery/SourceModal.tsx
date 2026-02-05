import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Link, Image } from 'lucide-react';
import { Button } from '../../../../components/ui/atoms/Button/Button';
import type { GallerySourceType } from '../../../../core/types/gallery';

interface SourceModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (data: { type: GallerySourceType; label: string; url?: string }) => void;
    mode?: 'add' | 'edit';
    initialData?: { label: string; url?: string; type?: GallerySourceType };
}

/**
 * Modal for adding or editing a gallery source.
 * Reuses styling patterns from PlaylistEditModal and ConfirmationModal.
 */
export const SourceModal: React.FC<SourceModalProps> = ({
    isOpen,
    onClose,
    onSave,
    mode = 'add',
    initialData
}) => {
    const [label, setLabel] = useState(initialData?.label || '');
    const [url, setUrl] = useState(initialData?.url || '');

    // Reset state when modal opens
    React.useEffect(() => {
        if (isOpen) {
            setLabel(initialData?.label || '');
            setUrl(initialData?.url || '');
        }
    }, [isOpen, initialData]);

    if (!isOpen) return null;

    // Auto-detect source type from URL
    const detectType = (inputUrl: string): GallerySourceType => {
        if (inputUrl.includes('pinterest.com') || inputUrl.includes('pin.it')) {
            return 'pinterest';
        }
        return 'custom';
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();

        // If editing, preserve existing type unless URL changes significantly
        // For new source, auto-detect
        let type: GallerySourceType = 'custom';

        if (url) {
            type = detectType(url);
        } else if (mode === 'edit' && initialData?.type) {
            type = initialData.type;
        }

        onSave({
            type,
            label: label.trim() || (type === 'pinterest' ? 'Pinterest Reference' : 'Custom Reference'),
            url: url.trim() || undefined
        });

        if (mode === 'add') {
            // Reset form only for add mode
            setLabel('');
            setUrl('');
        }
        onClose();
    };

    return createPortal(
        <div
            className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in"
            onClick={onClose}
        >
            <div
                className="bg-bg-secondary rounded-xl w-[450px] max-w-[90vw] flex flex-col overflow-hidden animate-scale-in border border-border shadow-2xl"
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className="px-6 py-4 flex items-center justify-between border-b border-border">
                    <h2 className="text-xl font-bold text-text-primary m-0">
                        {mode === 'add' ? 'Add Source' : 'Edit Source'}
                    </h2>
                    <button
                        onClick={onClose}
                        className="bg-transparent border-none text-text-primary cursor-pointer hover:opacity-70 transition-opacity"
                    >
                        <X size={24} />
                    </button>
                </div>

                {/* Form */}
                <form onSubmit={handleSubmit} className="p-6 flex flex-col gap-5">
                    {/* Label Input */}
                    <div className="flex flex-col gap-2">
                        <label className="text-sm text-text-secondary flex items-center gap-2">
                            <Image size={14} />
                            Label
                        </label>
                        <input
                            type="text"
                            value={label}
                            onChange={(e) => setLabel(e.target.value)}
                            placeholder="e.g., Sunset Vibes, Neon City"
                            className="p-2.5 rounded border border-border bg-bg-primary text-text-primary text-base outline-none focus:border-text-primary transition-colors"
                            autoFocus
                        />
                    </div>

                    {/* URL Input */}
                    <div className="flex flex-col gap-2">
                        <label className="text-sm text-text-secondary flex items-center gap-2">
                            <Link size={14} />
                            Reference URL (optional)
                        </label>
                        <input
                            type="url"
                            value={url}
                            onChange={(e) => setUrl(e.target.value)}
                            placeholder="https://pinterest.com/pin/..."
                            className="p-2.5 rounded border border-border bg-bg-primary text-text-primary text-base outline-none focus:border-text-primary transition-colors"
                        />
                        <span className="text-xs text-text-tertiary">
                            Pinterest links will be auto-detected
                        </span>
                    </div>

                    {/* Actions */}
                    <div className="flex justify-end gap-3 mt-2">
                        <Button
                            variant="secondary"
                            size="sm"
                            onClick={onClose}
                            type="button"
                        >
                            Cancel
                        </Button>
                        <Button
                            variant="primary"
                            size="sm"
                            type="submit"
                            disabled={!label.trim()}
                        >
                            {mode === 'add' ? 'Add Source' : 'Save Changes'}
                        </Button>
                    </div>
                </form>
            </div>
        </div>,
        document.body
    );
};
