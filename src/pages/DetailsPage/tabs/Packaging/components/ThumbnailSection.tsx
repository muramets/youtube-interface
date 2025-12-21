import React, { useRef, useState } from 'react';
import { Upload, MoreVertical, Trash2, History } from 'lucide-react';
import { ThumbnailHistoryModal } from '../modals/ThumbnailHistoryModal';
import { type CoverVersion } from '../../../../../utils/youtubeApi';

interface ThumbnailSectionProps {
    value: string;
    onChange: (value: string) => void;
    readOnly?: boolean;
    onABTestClick?: () => void;
    variants?: string[];
    history?: CoverVersion[];
    onDelete?: (timestamp: number) => void;
    onClone?: (version: CoverVersion) => void;
    cloningVersion?: number | null;
    currentVersionInfo?: {
        version?: number;
        originalName?: string;
    };

}

export const ThumbnailSection: React.FC<ThumbnailSectionProps> = ({
    value,
    onChange,
    readOnly = false,
    onABTestClick,
    variants = [],
    history = [],
    onDelete,
    onClone,
    cloningVersion,
    currentVersionInfo
}) => {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [showDropdown, setShowDropdown] = useState(false);
    const [historyModalOpen, setHistoryModalOpen] = useState(false);
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
        // Find if this is a history item to delete it (matching Version History behavior)
        if (onDelete && history.length > 0) {
            const item = history.find(v => v.url === value);
            if (item) {
                onDelete(item.timestamp);
            }
        }

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
                {value ? (
                    <div className="flex flex-col gap-2 w-40">
                        <div className="relative w-40 aspect-video rounded-lg border border-dashed border-border p-1 group hover:border-text-primary transition-colors bg-bg-secondary">
                            <div className="flex h-full w-full rounded overflow-hidden">
                                {(variants.length > 0 ? variants : [value]).map((src, index, all) => (
                                    <React.Fragment key={index}>
                                        <img
                                            src={src}
                                            alt={variants.length > 0 ? `Thumbnail variant ${index + 1}` : "Thumbnail preview"}
                                            className="h-full object-cover flex-1 min-w-0"
                                            style={{ width: `${100 / all.length}%` }}
                                        />
                                        {index < all.length - 1 && (
                                            <div className="w-[1px] h-full bg-border flex-shrink-0" />
                                        )}
                                    </React.Fragment>
                                ))}
                            </div>

                            {/* "Test" badge on hover - only if A/B testing is active */}
                            {variants.length > 0 && (
                                <div className="absolute top-2 left-2 w-max h-6 px-2 bg-black/60 rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none flex items-center justify-center z-10">
                                    <span className="text-white text-xs font-medium">Test</span>
                                </div>
                            )}



                            {/* More button with dropdown - hide in read-only mode */}
                            {!readOnly && (
                                <div ref={dropdownRef} className={`absolute top-1.5 right-1.5 transition-opacity ${showDropdown ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
                                    <button
                                        onClick={() => setShowDropdown(!showDropdown)}
                                        className="w-7 h-7 rounded-full bg-black/60 text-white flex items-center justify-center
                                            hover:bg-black/80 transition-colors"
                                    >
                                        <MoreVertical size={16} />
                                    </button>

                                    {/* Dropdown */}
                                    {showDropdown && (
                                        <div className="absolute top-8 right-0 bg-bg-secondary border border-border rounded-lg shadow-lg py-1 min-w-[160px] z-10">
                                            {onABTestClick && (
                                                <button
                                                    onClick={() => {
                                                        setShowDropdown(false);
                                                        onABTestClick();
                                                    }}
                                                    className="w-full px-4 py-2 text-left text-sm text-text-primary hover:bg-white/5 flex items-center gap-2"
                                                >
                                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                                                        <path d="M12 1a1 1 0 011 1v20a1 1 0 11-2 0V2a1 1 0 011-1Zm-2 4H3v14h7v2H3a2 2 0 01-1.99-1.796L1 19V5a2 2 0 012-2h7v2Zm11-2a2 2 0 012 2v14a2 2 0 01-2 2h-7v-4h4.132a1 1 0 00.832-1.555L14 8V3h7Zm-11 8.604L7.736 15H10v2H5.868a1 1 0 01-.832-1.555L10 8v3.606Z" />
                                                    </svg>
                                                    A/B Testing
                                                </button>
                                            )}

                                            {/* Version History - only if not A/B testing and has history */}
                                            {variants.length === 0 && history.length > 0 && (
                                                <button
                                                    onClick={() => {
                                                        setShowDropdown(false);
                                                        setHistoryModalOpen(true);
                                                    }}
                                                    className="w-full px-4 py-2 text-left text-sm text-text-primary hover:bg-white/5 flex items-center gap-2"
                                                >
                                                    <History size={16} />
                                                    Version History
                                                </button>
                                            )}
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

                        {/* A/B testing label below */}
                        {variants.length > 0 && (
                            <span className="text-sm text-text-secondary w-full text-center">A/B testing</span>
                        )}
                    </div>
                ) : (
                    /* No value - show upload button or placeholder */
                    readOnly ? (
                        <div className="w-40 aspect-video rounded-lg bg-bg-secondary flex items-center justify-center border border-dashed border-border">
                            <span className="text-xs text-text-secondary">No thumbnail</span>
                        </div>
                    ) : (
                        <div className="relative group w-40 aspect-video">
                            <button
                                onClick={() => fileInputRef.current?.click()}
                                className="w-full h-full rounded-lg border border-dashed border-border 
                                    hover:border-text-primary transition-colors flex flex-col items-center justify-center gap-2
                                    bg-bg-secondary"
                            >
                                <Upload size={24} className="text-text-secondary" />
                                <span className="text-xs text-text-secondary">Upload thumbnail</span>
                            </button>

                            {/* More button for empty state - show if history exists */}
                            {!readOnly && history.length > 0 && (
                                <div ref={dropdownRef} className="absolute top-1.5 right-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setShowDropdown(!showDropdown);
                                        }}
                                        className="w-7 h-7 rounded-full bg-black/60 text-white flex items-center justify-center
                                            hover:bg-black/80 transition-colors"
                                    >
                                        <MoreVertical size={16} />
                                    </button>

                                    {/* Dropdown for empty state */}
                                    {showDropdown && (
                                        <div className="absolute top-8 right-0 bg-bg-secondary border border-border rounded-lg shadow-lg py-1 min-w-[160px] z-10" onClick={e => e.stopPropagation()}>
                                            {onABTestClick && (
                                                <button
                                                    onClick={() => {
                                                        setShowDropdown(false);
                                                        onABTestClick();
                                                    }}
                                                    className="w-full px-4 py-2 text-left text-sm text-text-primary hover:bg-white/5 flex items-center gap-2"
                                                >
                                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                                                        <path d="M12 1a1 1 0 011 1v20a1 1 0 11-2 0V2a1 1 0 011-1Zm-2 4H3v14h7v2H3a2 2 0 01-1.99-1.796L1 19V5a2 2 0 012-2h7v2Zm11-2a2 2 0 012 2v14a2 2 0 01-2 2h-7v-4h4.132a1 1 0 00.832-1.555L14 8V3h7Zm-11 8.604L7.736 15H10v2H5.868a1 1 0 01-.832-1.555L10 8v3.606Z" />
                                                    </svg>
                                                    A/B Testing
                                                </button>
                                            )}
                                            <button
                                                onClick={() => {
                                                    setShowDropdown(false);
                                                    setHistoryModalOpen(true);
                                                }}
                                                className="w-full px-4 py-2 text-left text-sm text-text-primary hover:bg-white/5 flex items-center gap-2"
                                            >
                                                <History size={16} />
                                                Version History
                                            </button>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    )
                )}
            </div>

            {
                !readOnly && (
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        onChange={handleFileSelect}
                        className="hidden"
                    />
                )
            }

            <ThumbnailHistoryModal
                isOpen={historyModalOpen}
                onClose={() => setHistoryModalOpen(false)}
                currentThumbnail={value}
                history={history}
                onApply={(url, close = true) => {
                    onChange(url);
                    if (close) setHistoryModalOpen(false);
                }}
                onDelete={onDelete}
                onClone={onClone}
                cloningVersion={cloningVersion}
                currentVersionInfo={currentVersionInfo}
            />
        </div >
    );
};
