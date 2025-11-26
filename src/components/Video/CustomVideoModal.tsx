import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Image as ImageIcon, Trash2, Info, ArrowUp, ChevronLeft, ChevronRight } from 'lucide-react';
import type { VideoDetails } from '../../utils/youtubeApi';
import { useChannel } from '../../context/ChannelContext';
import { resizeImage } from '../../utils/imageUtils';

interface CustomVideoModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (video: Omit<VideoDetails, 'id'>) => void;
    initialData?: VideoDetails;
}

interface CoverVersion {
    url: string;
    version: number;
    timestamp: number;
    originalName?: string;
}

export const CustomVideoModal: React.FC<CustomVideoModalProps> = ({ isOpen, onClose, onSave, initialData }) => {
    const [title, setTitle] = useState('');
    const [viewCount, setViewCount] = useState('');
    const [duration, setDuration] = useState('');
    const [coverImage, setCoverImage] = useState<string | null>(null);
    const [coverHistory, setCoverHistory] = useState<CoverVersion[]>([]);
    const [isDragging, setIsDragging] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const modalRef = useRef<HTMLDivElement>(null);

    // Versioning State
    const [currentOriginalName, setCurrentOriginalName] = useState<string>('Original Cover');
    const [currentVersion, setCurrentVersion] = useState<number>(1);
    const [highestVersion, setHighestVersion] = useState<number>(1);

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
                setCoverHistory(initialData.coverHistory || []);
                setCurrentOriginalName(initialData.customImageName || 'Original Cover');

                // Initialize versioning
                const savedCurrentVersion = initialData.customImageVersion || 1;
                // Calculate highest version seen so far to ensure we never reuse numbers
                // It should be at least the current version, or the max of history, or 1.
                const historyMax = initialData.coverHistory && initialData.coverHistory.length > 0
                    ? Math.max(...initialData.coverHistory.map(v => v.version))
                    : 0;

                const savedHighestVersion = initialData.highestVersion || Math.max(savedCurrentVersion, historyMax);

                setCurrentVersion(savedCurrentVersion);
                setHighestVersion(savedHighestVersion);
            } else {
                setTitle('');
                setViewCount('');
                setDuration('');
                setCoverImage(null);
                setCoverHistory([]);
                setCurrentOriginalName('Original Cover');
                setCurrentVersion(1);
                setHighestVersion(1);
            }
        }
    }, [isOpen, initialData]);

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

                if (coverImage) {
                    // Move current to history
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

                // Increment version
                const newVersion = highestVersion + 1;
                setCurrentVersion(newVersion);
                setHighestVersion(newVersion);

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
        }

        // Set restored as current
        setCoverImage(versionToRestore.url);
        setCurrentOriginalName(versionToRestore.originalName || 'Restored Version');
        setCurrentVersion(versionToRestore.version);
        // Do NOT increment highestVersion
    };

    const handleDeleteVersion = (e: React.MouseEvent, timestamp: number) => {
        e.stopPropagation();
        setCoverHistory(prev => prev.filter(v => v.timestamp !== timestamp));
    };

    const { currentChannel } = useChannel();

    const handleSave = () => {
        if (!title || !coverImage) {
            alert('Please provide a title and a cover image.');
            return;
        }

        const videoData: Omit<VideoDetails, 'id'> = {
            title,
            thumbnail: coverImage,
            channelTitle: currentChannel?.name || 'My Channel',
            channelAvatar: currentChannel?.avatar || '',
            publishedAt: initialData ? initialData.publishedAt : new Date().toISOString(),
            viewCount: viewCount || '0',
            duration: duration || '0:00',
            isCustom: true,
            customImage: coverImage,
            createdAt: initialData?.createdAt,
            coverHistory: coverHistory,
            customImageName: currentOriginalName,
            customImageVersion: currentVersion,
            highestVersion: highestVersion
        };

        onSave(videoData);
        onClose();
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
        <div
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-[1000] animate-fade-in"
            onMouseDown={handleBackdropClick}
        >
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
                    {coverHistory.length > 0 && (
                        <div className="flex flex-col gap-2">
                            <label className="text-xs text-text-secondary uppercase tracking-wider font-bold">Version History</label>

                            <div className="relative w-full group/history">
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
                                    className="flex gap-3 overflow-x-auto scrollbar-hide"
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
                                                        <div className="relative group/info">
                                                            <button className="w-6 h-6 rounded-full bg-black/60 hover:bg-black/80 text-white flex items-center justify-center backdrop-blur-sm transition-colors border-none cursor-pointer">
                                                                <Info size={12} />
                                                            </button>
                                                            {/* Tooltip */}
                                                            <div className="absolute left-0 top-full mt-1 bg-black/90 text-white text-[10px] px-2 py-1 rounded opacity-0 group-hover/info:opacity-100 transition-opacity pointer-events-none z-50 whitespace-normal min-w-[120px] max-w-[200px] break-words shadow-lg border border-white/10">
                                                                {version.originalName || 'Unknown Filename'}
                                                            </div>
                                                        </div>

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
                                                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                                                        <button
                                                            onClick={() => handleRestoreVersion(version)}
                                                            className="w-8 h-8 rounded-full bg-[#3ea6ff]/90 hover:bg-[#3ea6ff] text-black flex items-center justify-center backdrop-blur-sm transition-all transform scale-90 hover:scale-100 shadow-lg border-none cursor-pointer pointer-events-auto"
                                                            title="Set as Main Cover"
                                                        >
                                                            <ArrowUp size={18} strokeWidth={3} />
                                                        </button>
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
                            placeholder="e.g. My Amazing Trip to Japan 2025"
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
                            placeholder="e.g. 1.2M"
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
                            placeholder="e.g. 14:20"
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
                            className="px-4 py-2 rounded-full border-none bg-[#3ea6ff] text-black cursor-pointer font-bold hover:bg-[#3ea6ff]/90 transition-colors"
                        >
                            Save
                        </button>
                    </div>
                </div>
            </div>
        </div>,
        document.body
    );
};
