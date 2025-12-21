import React, { useRef, useState } from 'react';
import { Upload, MoreVertical, Trash2 } from 'lucide-react';

interface ThumbnailSectionProps {
    value: string;
    onChange: (value: string) => void;
    readOnly?: boolean;
}

export const ThumbnailSection: React.FC<ThumbnailSectionProps> = ({ value, onChange, readOnly = false }) => {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [showDropdown, setShowDropdown] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        // Validate file type
        if (!file.type.startsWith('image/')) {
            return;
        }

        // Convert to base64 for preview (in production, would upload to storage)
        const reader = new FileReader();
        reader.onloadend = () => {
            onChange(reader.result as string);
        };
        reader.readAsDataURL(file);
    };

    const handleRemove = () => {
        onChange('');
        setShowDropdown(false);
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    };

    // Close dropdown when clicking outside
    React.useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setShowDropdown(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    return (
        <div className="flex flex-col gap-2">
            <label className="text-xs text-text-secondary font-medium tracking-wider uppercase">
                Thumbnail
            </label>
            {!readOnly && !value && (
                <p className="text-xs text-text-secondary">
                    Select or upload a picture that shows what's in your video.
                </p>
            )}

            <div className="mt-2">
                {/* If has value - show image with more button */}
                {value ? (
                    <div className="relative w-40 aspect-video rounded-lg border-2 border-dashed border-border p-1 group">
                        <img
                            src={value}
                            alt="Thumbnail preview"
                            className="w-full h-full object-cover rounded"
                        />
                        {/* More button with dropdown - hide in read-only mode */}
                        {!readOnly && (
                            <div ref={dropdownRef} className="absolute top-1.5 right-1.5">
                                <button
                                    onClick={() => setShowDropdown(!showDropdown)}
                                    className="w-7 h-7 rounded-full bg-black/60 text-white flex items-center justify-center
                                        hover:bg-black/80 transition-colors"
                                >
                                    <MoreVertical size={16} />
                                </button>

                                {/* Dropdown */}
                                {showDropdown && (
                                    <div className="absolute top-12 right-0 bg-modal-surface border border-border rounded-lg shadow-lg py-1 min-w-[140px] z-10">
                                        <button
                                            onClick={handleRemove}
                                            className="w-full px-4 py-2 text-left text-sm text-text-primary hover:bg-white/5 flex items-center gap-2"
                                        >
                                            <Trash2 size={16} />
                                            Remove
                                        </button>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                ) : (
                    /* No value - show upload button or placeholder */
                    readOnly ? (
                        <div className="w-40 aspect-video rounded-lg bg-bg-secondary flex items-center justify-center border-2 border-dashed border-border">
                            <span className="text-xs text-text-secondary">No thumbnail</span>
                        </div>
                    ) : (
                        <button
                            onClick={() => fileInputRef.current?.click()}
                            className="w-40 aspect-video rounded-lg border-2 border-dashed border-border 
                                hover:border-text-primary transition-colors flex flex-col items-center justify-center gap-2
                                bg-bg-secondary"
                        >
                            <Upload size={24} className="text-text-secondary" />
                            <span className="text-xs text-text-secondary">Upload thumbnail</span>
                        </button>
                    )
                )}
            </div>

            {!readOnly && (
                <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleFileSelect}
                    className="hidden"
                />
            )}
        </div>
    );
};
