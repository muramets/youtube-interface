import React, { useRef, useState } from 'react';
import { Upload, MoreVertical, Trash2, History, Loader2, Download } from 'lucide-react';
import { ThumbnailHistoryModal } from './ThumbnailHistoryModal';
import { type CoverVersion } from '../../../../core/utils/youtubeApi';
import { downloadImageDirect } from '../../../../core/utils/zipUtils';

interface ThumbnailSectionProps {
    value: string;
    onChange: (value: string, filename?: string, version?: number) => void;
    /** Callback to handle file upload to Firebase Storage. Returns the download URL. */
    onFileUpload?: (file: File) => Promise<string>;
    /** Callback to push current thumbnail to history before replacing it */
    onPushToHistory?: (url: string) => void;
    readOnly?: boolean;
    /** YouTube thumbnail URL for display when value is empty (read-only YouTube videos) */
    youtubeThumbnailUrl?: string;
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
    widthClass?: string;
    checkIsCloned?: (thumbnailUrl: string) => boolean;
    likedThumbnailVersions?: number[];
    onLikeThumbnail?: (version: number) => void;
    onRemoveThumbnail?: (version: number) => void;
}

/**
 * ThumbnailSection - Displays and manages thumbnail upload with A/B testing support.
 * 
 * BUSINESS LOGIC: A/B Test Mode Detection
 * ----------------------------------------
 * The `variants` prop contains thumbnail variants for A/B testing.
 * We distinguish between three states:
 * 
 * 1. variants.length === 0: No A/B test, or only title-based test
 * 2. variants.length === 1: Single thumbnail (current), not a real test
 * 3. variants.length >= 2: Active thumbnail A/B test with multiple variants
 * 
 * The >= 2 threshold is critical because:
 * - When user creates a "title only" A/B test, we still initialize modal
 *   with the current thumbnail in slot 0, but save returns empty array
 * - Version History should remain accessible during title-only tests
 * - "Test" badge and split-view should only appear for real thumbnail tests
 */
export const ThumbnailSection: React.FC<ThumbnailSectionProps> = ({
    value,
    onChange,
    onFileUpload,
    onPushToHistory,
    readOnly = false,
    youtubeThumbnailUrl,
    onABTestClick,
    variants = [],
    history = [],
    onDelete,
    onClone,
    cloningVersion,
    currentVersionInfo,
    widthClass = "w-40",
    checkIsCloned,
    likedThumbnailVersions,
    onLikeThumbnail,
    onRemoveThumbnail
}) => {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [showDropdown, setShowDropdown] = useState(false);
    const [historyModalOpen, setHistoryModalOpen] = useState(false);
    const [isUploading, setIsUploading] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        // ... implementation remains same
        const file = e.target.files?.[0];
        if (!file) return;
        if (!file.type.startsWith('image/')) return;
        if (fileInputRef.current) fileInputRef.current.value = '';
        if (onFileUpload) {
            setIsUploading(true);
            try {
                if (value && !value.startsWith('blob:') && onPushToHistory) onPushToHistory(value);
                const objectUrl = URL.createObjectURL(file);
                onChange(objectUrl, file.name);
                const downloadUrl = await onFileUpload(file);
                onChange(downloadUrl, file.name);
                URL.revokeObjectURL(objectUrl);
            } catch (error) {
                console.error('Failed to upload thumbnail:', error);
                onChange(value);
            } finally {
                setIsUploading(false);
            }
        } else {
            const reader = new FileReader();
            reader.onloadend = () => onChange(reader.result as string);
            reader.readAsDataURL(file);
        }
    };

    const handleRemove = () => {
        if (onDelete && history.length > 0) {
            const item = history.find(v => v.url === value);
            if (item) onDelete(item.timestamp);
        }
        onChange('');
        setShowDropdown(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    // Close dropdown when clicking outside
    React.useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setShowDropdown(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside, true);
        return () => document.removeEventListener('mousedown', handleClickOutside, true);
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
                {(value || variants.length >= 2) ? (
                    <div className={`flex flex-col gap-2 ${widthClass}`}>
                        <div
                            className={`relative ${widthClass} aspect-video rounded-lg border border-dashed border-border p-1 group hover:border-text-primary transition-colors bg-bg-secondary cursor-pointer`}
                            onClick={() => !readOnly && fileInputRef.current?.click()}
                        >
                            {/* Split-view display */}
                            <div className="flex h-full w-full rounded overflow-hidden">
                                {(variants.length >= 2 ? variants : [value]).map((src, index, all) => (
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

                            {/* Upload progress indicator */}
                            {isUploading && (
                                <div className="absolute inset-0 bg-black/50 rounded flex items-center justify-center">
                                    <Loader2 size={24} className="text-white animate-spin" />
                                </div>
                            )}

                            {/* "Test" badge on hover */}
                            {variants.length >= 2 && (
                                <div className="absolute top-2 left-2 w-max h-6 px-2 bg-black/60 rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none flex items-center justify-center z-10">
                                    <span className="text-white text-xs font-medium">Test</span>
                                </div>
                            )}

                            {/* More button with dropdown */}
                            {!readOnly && (
                                <div ref={dropdownRef} className={`absolute top-1.5 right-1.5 transition-opacity ${showDropdown ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
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
                                            {variants.length < 2 && history.length > 0 && (
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

                        {variants.length >= 2 && (
                            <span className="text-sm text-text-secondary w-full text-center">A/B testing</span>
                        )}
                    </div>
                ) : (
                    readOnly ? (
                        youtubeThumbnailUrl ? (
                            <div className={`relative group ${widthClass} aspect-video`}>
                                <div className="w-full h-full rounded-lg border border-border overflow-hidden">
                                    <img
                                        src={youtubeThumbnailUrl}
                                        alt="YouTube thumbnail"
                                        className="w-full h-full object-cover"
                                    />
                                </div>
                                {/* Download button on hover */}
                                <button
                                    onClick={() => downloadImageDirect({ id: 'thumbnail', url: youtubeThumbnailUrl })}
                                    className="absolute bottom-2 right-2 w-8 h-8 rounded-full bg-black/60 text-white flex items-center justify-center
                                        opacity-0 group-hover:opacity-100 hover:bg-black/80 transition-all"
                                    title="Download max quality thumbnail"
                                >
                                    <Download size={16} />
                                </button>
                            </div>
                        ) : (
                            <div className={`${widthClass} aspect-video rounded-lg bg-bg-secondary flex items-center justify-center border border-dashed border-border`}>
                                <span className="text-xs text-text-secondary">No thumbnail</span>
                            </div>
                        )
                    ) : (
                        <div className={`relative group ${widthClass} aspect-video`}>
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
                onApply={(url, filename, version, close = true) => {
                    // When applying a historical version, swap it with the current one
                    // to prevent duplicates and preserve state.

                    // 1. Push CURRENT thumbnail to history before replacing it
                    if (value && onPushToHistory) {
                        onPushToHistory(value);
                    }

                    // 2. Remove the version we are applying from history (as it becomes current)
                    const appliedItem = history.find(v => v.url === url);
                    if (appliedItem && onDelete) {
                        onDelete(appliedItem.timestamp);
                    }

                    // 3. Update URL, filename, and version
                    onChange(url, filename, version);

                    if (close) setHistoryModalOpen(false);
                }}
                onDelete={onDelete}
                onClone={onClone}
                cloningVersion={cloningVersion}
                currentVersionInfo={currentVersionInfo}
                checkIsCloned={checkIsCloned}
                likedThumbnailVersions={likedThumbnailVersions}
                onLikeThumbnail={onLikeThumbnail}
                onRemoveThumbnail={onRemoveThumbnail}
            />
        </div >
    );
};
