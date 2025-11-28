import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Image as ImageIcon, Trash2, Info, ArrowUp, ChevronLeft, ChevronRight, Copy } from 'lucide-react';
import type { VideoDetails } from '../../utils/youtubeApi';
import { useVideo } from '../../context/VideoContext';
import { resizeImage } from '../../utils/imageUtils';
import { Toast } from '../Shared/Toast';
import { PortalTooltip } from '../Shared/PortalTooltip';
import { ClonedVideoTooltipContent } from './ClonedVideoTooltipContent';

interface CustomVideoModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (video: Omit<VideoDetails, 'id'>) => Promise<string | void>;
    onClone?: (video: VideoDetails, version: CoverVersion) => void;
    initialData?: VideoDetails;
}

interface CoverVersion {
    url: string;
    version: number;
    timestamp: number;
    originalName?: string;
}

export const CustomVideoModal: React.FC<CustomVideoModalProps> = ({ isOpen, onClose, onSave, onClone, initialData }) => {
    const { fetchVideoHistory, saveVideoHistory, deleteVideoHistoryItem, currentChannel, videos } = useVideo();
    const [title, setTitle] = useState('');
    const [viewCount, setViewCount] = useState('');
    const [duration, setDuration] = useState('');
    const [coverImage, setCoverImage] = useState<string | null>(null);
    const [isDragging, setIsDragging] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const modalRef = useRef<HTMLDivElement>(null);

    // History State
    const [coverHistory, setCoverHistory] = useState<CoverVersion[]>([]);
    const [isLoadingHistory, setIsLoadingHistory] = useState(false);
    const [deletedHistoryIds, setDeletedHistoryIds] = useState<Set<number | string>>(new Set());

    // Versioning State
    const [currentVersion, setCurrentVersion] = useState(1);
    const [highestVersion, setHighestVersion] = useState(0);
    const [currentOriginalName, setCurrentOriginalName] = useState('Original Cover');
    const [fileVersionMap, setFileVersionMap] = useState<Record<string, number>>({});

    // Toast State
    const [toastMessage, setToastMessage] = useState('');
    const [showToast, setShowToast] = useState(false);
    const [toastType, setToastType] = useState<'success' | 'error'>('success');
    const [toastPosition, setToastPosition] = useState<'top' | 'bottom'>('bottom');

    // Scrolling Refs & State
    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const [showLeftArrow, setShowLeftArrow] = useState(false);
    const [showRightArrow, setShowRightArrow] = useState(false);

    const checkScroll = () => {
        if (scrollContainerRef.current) {
            const { scrollLeft, scrollWidth, clientWidth } = scrollContainerRef.current;
            setShowLeftArrow(scrollLeft > 0);
            setShowRightArrow(scrollLeft < scrollWidth - clientWidth - 1);
        }
    };

    useEffect(() => {
        const container = scrollContainerRef.current;
        if (container) {
            container.addEventListener('scroll', checkScroll);
            window.addEventListener('resize', checkScroll);
            checkScroll();
            // Check again after render to ensure layout is stable
            setTimeout(checkScroll, 100);

            return () => {
                container.removeEventListener('scroll', checkScroll);
                window.removeEventListener('resize', checkScroll);
            };
        }
    }, [coverHistory, isOpen]); // Re-check when history changes or modal opens

    useEffect(() => {
        if (isOpen) {
            if (initialData) {
                setTitle(initialData.title);
                setViewCount(initialData.viewCount || '');
                setDuration(initialData.duration || '');
                setCoverImage(initialData.customImage || initialData.thumbnail);
                setCurrentOriginalName(initialData.customImageName || 'Original Cover');
                setCoverHistory([]); // Clear previous history immediately

                // Initialize versioning
                const savedCurrentVersion = initialData.customImageVersion || 1;
                // If we have a custom image, highest is at least 1. If not, it's 0.
                const hasCustomImage = !!initialData.customImage;
                const savedHighestVersion = initialData.highestVersion || (hasCustomImage ? 1 : 0);
                const savedFileVersionMap = initialData.fileVersionMap || {};

                setCurrentVersion(savedCurrentVersion);
                setHighestVersion(savedHighestVersion);
                setFileVersionMap(savedFileVersionMap);

                // Load History
                const loadHistory = async () => {
                    if (initialData.id && !initialData.id.startsWith('custom-')) {
                        // For real videos, we might store history differently or not at all yet.
                        // But if it's a custom video (or we treat all edited videos as custom-ish), we fetch.
                        // Actually, our data model says 'isCustom' for manually added ones.
                        // But we also edit real videos.
                        // Let's try to fetch history for any video ID.
                        setIsLoadingHistory(true);
                        try {
                            const history = await fetchVideoHistory(initialData.id);
                            setCoverHistory(history);
                        } catch (error) {
                            console.error("Failed to load history:", error);
                        } finally {
                            setIsLoadingHistory(false);
                        }
                    } else if (initialData.id) {
                        // It is a custom video
                        // Only show loader if we expect history.
                        // Prefer historyCount if available, otherwise fallback to highestVersion heuristic.
                        const hasHistoryCount = typeof initialData.historyCount === 'number';
                        const shouldShowLoader = hasHistoryCount
                            ? (initialData.historyCount! > 0)
                            : (initialData.highestVersion || 1) > 1;

                        if (shouldShowLoader) {
                            setIsLoadingHistory(true);
                        }

                        try {
                            const history = await fetchVideoHistory(initialData.id);
                            // Filter out current cover from history to avoid duplicates
                            const currentUrl = initialData.customImage || initialData.thumbnail;
                            const filteredHistory = history.filter(h => h.url !== currentUrl);
                            setCoverHistory(filteredHistory);
                        } catch (error) {
                            console.error("Failed to load history:", error);
                        } finally {
                            if (shouldShowLoader) {
                                setIsLoadingHistory(false);
                            }
                        }
                    }
                };
                loadHistory();

            } else {
                setTitle('');
                setViewCount('');
                setDuration('');
                setCoverImage(null);
                setCoverHistory([]);
                setDeletedHistoryIds(new Set());
                setCurrentOriginalName('Original Cover');
                setCurrentVersion(1);
                setHighestVersion(0);
                setFileVersionMap({});
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen]);

    useEffect(() => {
        if (isOpen) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = 'unset';
        }
        return () => {
            document.body.style.overflow = 'unset';
        };
    }, [isOpen]);

    if (!isOpen) return null;

    const handleFileWithMeta = async (file: File) => {
        if (file && file.type.startsWith('image/')) {
            try {
                const resizedImage = await resizeImage(file, 800, 0.8);



                // Determine Version
                // Sanitize key for Firestore (no dots allowed in map keys)
                const fileKey = `${file.name.replace(/\./g, '_')}-${file.size}`;
                let newVersion: number;

                if (fileVersionMap[fileKey]) {
                    // File seen before (same name and size)
                    const existingVersion = fileVersionMap[fileKey];

                    // Check if this version is currently active or in history (and not deleted)
                    const isCurrent = currentVersion === existingVersion;
                    const isInHistory = coverHistory.some(h => h.version === existingVersion);

                    if (isCurrent || isInHistory) {
                        setToastMessage('This cover image already exists!');
                        setToastType('error');
                        setToastPosition('top');
                        setShowToast(true);
                        return;
                    }

                    // If it was seen before but not currently active/history (e.g. was deleted), restore its version
                    newVersion = existingVersion;
                } else {
                    // New file, assign next available version
                    newVersion = highestVersion + 1;
                    // Update map
                    setFileVersionMap(prev => ({ ...prev, [fileKey]: newVersion }));
                    // Update highest version
                    setHighestVersion(newVersion);
                }

                // If we are here, it's NOT a duplicate. Safe to update history and current image.
                if (coverImage) {
                    // Move current to history (Optimistic update)
                    const historyVersion: CoverVersion = {
                        url: coverImage,
                        version: currentVersion,
                        timestamp: Date.now(),
                        originalName: currentOriginalName
                    };
                    setCoverHistory(prev => [historyVersion, ...prev]);
                }

                // Set new image as current
                setCoverImage(resizedImage);
                setCurrentOriginalName(file.name);
                setCurrentVersion(newVersion);

            } catch (error) {
                console.error('Error resizing image:', error);
                alert('Failed to process image. Please try another one.');
            }
        }
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            handleFileWithMeta(e.dataTransfer.files[0]);
        }
    };

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(true);
    };

    const handleDragLeave = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
    };

    const handleRestoreVersion = (versionToRestore: CoverVersion) => {
        if (coverImage) {
            // Move current to history
            const historyVersion: CoverVersion = {
                url: coverImage,
                version: currentVersion,
                timestamp: Date.now(),
                originalName: currentOriginalName
            };
            // Add current to history, remove the one being restored from history
            setCoverHistory(prev => [historyVersion, ...prev.filter(v => v.timestamp !== versionToRestore.timestamp)]);

            // Mark the restored version as "deleted" from history (since it's now main)
            setDeletedHistoryIds(prev => new Set(prev).add(versionToRestore.timestamp));
        }

        // Set restored as current
        setCoverImage(versionToRestore.url);
        setCurrentOriginalName(versionToRestore.originalName || 'Restored Version');
        setCurrentVersion(versionToRestore.version);
        // Do NOT increment highestVersion
    };

    const handleDeleteVersion = async (e: React.MouseEvent, timestamp: number) => {
        e.stopPropagation();
        // Optimistic update
        setCoverHistory(prev => prev.filter(v => v.timestamp !== timestamp));
        // Mark for deletion
        setDeletedHistoryIds(prev => new Set(prev).add(timestamp));
    };



    const handleSave = async () => {
        if (!coverImage) {
            alert('Please provide a cover image.');
            return;
        }

        setIsSaving(true);

        const videoData: Omit<VideoDetails, 'id'> = {
            title: title || 'Very good playlist for you',
            thumbnail: coverImage,
            channelId: currentChannel?.id || '',
            channelTitle: currentChannel?.name || 'My Channel',
            channelAvatar: currentChannel?.avatar || '',
            publishedAt: initialData ? initialData.publishedAt : new Date().toISOString(),
            viewCount: viewCount || '1M',
            duration: duration || '1:02:11',
            isCustom: true,
            customImage: coverImage,
            createdAt: initialData?.createdAt,
            // coverHistory: coverHistory, // No longer saving history in main doc
            customImageName: currentOriginalName,
            customImageVersion: currentVersion,
            highestVersion: highestVersion,
            fileVersionMap: fileVersionMap,
            historyCount: coverHistory.length
        };

        try {
            // 1. Save the main video data
            const newId = await onSave(videoData);
            const targetId = initialData?.id || (typeof newId === 'string' ? newId : undefined);

            if (targetId) {
                // 2. Process Deletions
                const deletePromises = Array.from(deletedHistoryIds).map(timestamp =>
                    deleteVideoHistoryItem(targetId, timestamp.toString())
                );
                await Promise.all(deletePromises);

                // 3. Save History Items
                const savePromises = coverHistory.map(item => saveVideoHistory(targetId, item));
                await Promise.all(savePromises);
            }

            onClose();
        } catch (error) {
            console.error("Failed to save video:", error);
            alert("Failed to save video. The images might be too large. Try deleting some history versions.");
        } finally {
            setIsSaving(false);
        }
    };

    const handleBackdropClick = (e: React.MouseEvent) => {
        if (modalRef.current && !modalRef.current.contains(e.target as Node)) {
            onClose();
        }
    };

    // Scrolling Logic
    const scroll = (direction: 'left' | 'right') => {
        if (scrollContainerRef.current) {
            const scrollAmount = 200;
            scrollContainerRef.current.scrollBy({
                left: direction === 'left' ? -scrollAmount : scrollAmount,
                behavior: 'smooth'
            });
        }
    };

    const handleWheel = (e: React.WheelEvent) => {
        if (scrollContainerRef.current) {
            // Map vertical scroll to horizontal
            scrollContainerRef.current.scrollLeft += e.deltaY;
        }
    };

    return createPortal(
        <>
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm" onClick={handleBackdropClick}>
                <div
                    ref={modalRef}
                    className="bg-bg-secondary rounded-xl p-6 w-[500px] max-w-[90%] border border-border text-text-primary animate-scale-in-center shadow-2xl max-h-[90vh] overflow-y-auto custom-scrollbar"
                    onMouseDown={e => e.stopPropagation()}
                >
                    <div className="flex justify-between items-center mb-6">
                        <h2 className="m-0 text-xl font-bold">{initialData ? 'Edit Video' : 'Create My Video'}</h2>
                        <button onClick={onClose} className="bg-transparent border-none text-text-primary cursor-pointer hover:text-text-secondary transition-colors">
                            <X size={24} />
                        </button>
                    </div>

                    <div className="flex flex-col gap-5">
                        {/* Cover Image Upload */}
                        <div className="flex flex-col gap-2">
                            <label className="text-sm text-text-secondary font-medium">Cover Image (v.{currentVersion})</label>
                            <div
                                onClick={() => fileInputRef.current?.click()}
                                onDrop={handleDrop}
                                onDragOver={handleDragOver}
                                onDragLeave={handleDragLeave}
                                className={`w-full aspect-video rounded-lg bg-bg-primary border-2 border-dashed flex items-center justify-center cursor-pointer relative overflow-hidden transition-colors ${isDragging ? 'border-blue-500 bg-blue-500/10' : 'border-border hover:border-text-secondary'}`}
                            >
                                {coverImage ? (
                                    <img src={coverImage} alt="Cover Preview" className="w-full h-full object-cover" />
                                ) : (
                                    <div className="flex flex-col items-center gap-2 text-text-secondary">
                                        <ImageIcon size={40} />
                                        <span className="text-sm">Click or drag to upload cover</span>
                                    </div>
                                )}
                            </div>
                            <input
                                type="file"
                                ref={fileInputRef}
                                onChange={(e) => e.target.files && handleFileWithMeta(e.target.files[0])}
                                accept="image/*"
                                className="hidden"
                            />
                        </div>

                        {/* Cover History */}
                        {(coverHistory.length > 0 || isLoadingHistory) && (
                            <div className="flex flex-col gap-2">
                                <label className="text-xs text-text-secondary uppercase tracking-wider font-bold">Version History</label>

                                <div className="relative w-full group/history min-h-[100px]">
                                    {isLoadingHistory ? (
                                        <div className="flex gap-3 overflow-hidden">
                                            {[1, 2, 3].map((i) => (
                                                <div key={i} className="flex-shrink-0 w-36 aspect-video rounded-md bg-bg-secondary border border-border relative overflow-hidden">
                                                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent animate-shimmer" style={{ backgroundSize: '200% 100%' }}></div>
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <>
                                            {showLeftArrow && (
                                                <div className="absolute left-0 top-0 z-10 flex items-center bg-gradient-to-r from-bg-secondary via-bg-secondary to-transparent pr-8 pl-0 h-full">
                                                    <button
                                                        className="w-8 h-8 rounded-full bg-bg-primary hover:bg-hover-bg flex items-center justify-center border border-border cursor-pointer text-text-primary shadow-sm transition-colors"
                                                        onClick={() => scroll('left')}
                                                    >
                                                        <ChevronLeft size={20} />
                                                    </button>
                                                </div>
                                            )}

                                            <div
                                                ref={scrollContainerRef}
                                                className="flex gap-3 overflow-x-auto overflow-y-hidden scrollbar-hide"
                                                onWheel={handleWheel}
                                            >
                                                {coverHistory.map((version) => (
                                                    <div
                                                        key={version.timestamp}
                                                        className="flex-shrink-0 w-36 group relative"
                                                    >
                                                        {/* Removed overflow-hidden from parent to allow tooltip to pop out */}
                                                        <div className="aspect-video border border-border relative rounded-md">
                                                            <img src={version.url} alt={`v.${version.version}`} className="w-full h-full object-cover opacity-70 group-hover:opacity-40 transition-all duration-300 rounded-md" />

                                                            {/* Overlay Buttons */}
                                                            <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex flex-col justify-between p-2 rounded-md">
                                                                <div className="flex justify-between w-full">
                                                                    {/* Info Button (Top Left) */}
                                                                    <PortalTooltip
                                                                        content={
                                                                            <ClonedVideoTooltipContent
                                                                                version={version.version}
                                                                                filename={version.originalName || 'Unknown Filename'}
                                                                            />
                                                                        }
                                                                        align="left"
                                                                    >
                                                                        <button className="w-6 h-6 rounded-full bg-black/60 hover:bg-black/80 text-white flex items-center justify-center backdrop-blur-sm transition-colors border-none cursor-pointer">
                                                                            <Info size={12} />
                                                                        </button>
                                                                    </PortalTooltip>

                                                                    {/* Delete Button (Top Right) */}
                                                                    <button
                                                                        onClick={(e) => handleDeleteVersion(e, version.timestamp)}
                                                                        className="w-6 h-6 rounded-full bg-red-500/80 hover:bg-red-600 text-white flex items-center justify-center backdrop-blur-sm transition-colors border-none cursor-pointer"
                                                                        title="Delete Version"
                                                                    >
                                                                        <Trash2 size={12} />
                                                                    </button>
                                                                </div>

                                                                {/* Make Main Button (Center) */}
                                                                <div className="absolute inset-0 flex items-center justify-center pointer-events-none gap-2">
                                                                    <button
                                                                        onClick={() => handleRestoreVersion(version)}
                                                                        className="w-8 h-8 rounded-full bg-[#3ea6ff]/90 hover:bg-[#3ea6ff] text-black flex items-center justify-center backdrop-blur-sm transition-all transform scale-90 hover:scale-100 shadow-lg border-none cursor-pointer pointer-events-auto"
                                                                        title="Set as Main Cover"
                                                                    >
                                                                        <ArrowUp size={18} strokeWidth={3} />
                                                                    </button>
                                                                    {onClone && initialData && (
                                                                        (() => {
                                                                            const isCloned = videos.some(v =>
                                                                                v.isCloned &&
                                                                                v.clonedFromId === initialData.id &&
                                                                                v.customImageVersion === version.version
                                                                            );

                                                                            return (
                                                                                <button
                                                                                    onClick={(e) => {
                                                                                        if (isCloned) return;
                                                                                        e.stopPropagation();
                                                                                        onClone(initialData, version);
                                                                                    }}
                                                                                    disabled={isCloned}
                                                                                    className={`w-8 h-8 rounded-full flex items-center justify-center backdrop-blur-sm transition-all transform scale-90 hover:scale-100 shadow-lg border-none cursor-pointer pointer-events-auto ${isCloned
                                                                                        ? 'bg-gray-500/50 text-gray-300 cursor-not-allowed hover:scale-90'
                                                                                        : 'bg-green-500/90 hover:bg-green-600 text-white'
                                                                                        }`}
                                                                                    title={isCloned ? "Active clone already exists" : "Clone as a New Temporary Video"}
                                                                                >
                                                                                    <Copy size={16} strokeWidth={2.5} />
                                                                                </button>
                                                                            );
                                                                        })()
                                                                    )}
                                                                </div>
                                                            </div>
                                                        </div>
                                                        <div className="flex justify-between items-center mt-1 px-1">
                                                            <span className="text-xs text-text-secondary font-medium">v.{version.version}</span>
                                                            <span className="text-[10px] text-text-secondary">{new Date(version.timestamp).toLocaleDateString()}</span>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>

                                            {showRightArrow && (
                                                <div className="absolute right-0 top-0 z-10 flex items-center bg-gradient-to-l from-bg-secondary via-bg-secondary to-transparent pl-8 pr-0 h-full">
                                                    <button
                                                        className="w-8 h-8 rounded-full bg-bg-primary hover:bg-hover-bg flex items-center justify-center border border-border cursor-pointer text-text-primary shadow-sm transition-colors"
                                                        onClick={() => scroll('right')}
                                                    >
                                                        <ChevronRight size={20} />
                                                    </button>
                                                </div>
                                            )}
                                        </>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* Title Input */}
                        <div className="flex flex-col gap-2">
                            <label className="text-sm text-text-secondary font-medium">Video Title</label>
                            <input
                                type="text"
                                value={title}
                                onChange={(e) => setTitle(e.target.value)}
                                placeholder="Very good playlist for you"
                                onKeyDown={(e) => e.stopPropagation()}
                                className="p-2.5 rounded-lg border border-border bg-bg-primary text-text-primary text-base focus:outline-none focus:border-blue-500 transition-colors placeholder:text-text-secondary/50"
                            />
                        </div>

                        {/* View Count Input */}
                        <div className="flex flex-col gap-2">
                            <label className="text-sm text-text-secondary font-medium">View Count</label>
                            <input
                                type="text"
                                value={viewCount}
                                onChange={(e) => setViewCount(e.target.value)}
                                placeholder="1M"
                                onKeyDown={(e) => e.stopPropagation()}
                                className="p-2.5 rounded-lg border border-border bg-bg-primary text-text-primary text-base focus:outline-none focus:border-blue-500 transition-colors placeholder:text-text-secondary/50"
                            />
                        </div>

                        {/* Duration Input */}
                        <div className="flex flex-col gap-2">
                            <label className="text-sm text-text-secondary font-medium">Duration</label>
                            <input
                                type="text"
                                value={duration}
                                onChange={(e) => setDuration(e.target.value)}
                                placeholder="1:02:11"
                                onKeyDown={(e) => e.stopPropagation()}
                                className="p-2.5 rounded-lg border border-border bg-bg-primary text-text-primary text-base focus:outline-none focus:border-blue-500 transition-colors placeholder:text-text-secondary/50"
                            />
                        </div>

                        <div className="flex justify-end gap-3 mt-4">
                            <button
                                onClick={onClose}
                                className="px-4 py-2 rounded-full border-none bg-transparent text-text-primary cursor-pointer font-medium hover:bg-hover-bg transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleSave}
                                disabled={isSaving}
                                className={`px-4 py-2 rounded-full border-none text-black cursor-pointer font-bold transition-all relative overflow-hidden ${isSaving ? 'bg-[#3ea6ff]/70 cursor-wait' : 'bg-[#3ea6ff] hover:bg-[#3ea6ff]/90'}`}
                            >
                                {isSaving && (
                                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent animate-shimmer" style={{ backgroundSize: '200% 100%' }}></div>
                                )}
                                <span className="relative z-10">Save</span>
                            </button>
                        </div>
                    </div>
                </div>
            </div >
            <Toast
                message={toastMessage}
                isVisible={showToast}
                duration={4000}
                onClose={() => setShowToast(false)}
                type={toastType}
                position={toastPosition}
            />
        </>,
        document.body
    );
};
