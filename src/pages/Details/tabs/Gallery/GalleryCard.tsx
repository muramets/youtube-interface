/**
 * GalleryCard
 * 
 * Individual gallery item card styled like a YouTube video card.
 * Displays thumbnail, filename as title, fixed views, and channel info.
 */

import React, { useState } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Info, MoreVertical, Heart, Copy, Download, Trash2, Check, AlertCircle, Loader2, Video, Clock, ListPlus, Image as ImageIcon, ThumbsDown } from 'lucide-react';
import type { GalleryItem } from '../../../../core/types/gallery';
import { GALLERY_CARD_DEFAULTS } from '../../../../core/types/gallery';
import { PortalTooltip } from '../../../../components/ui/atoms/PortalTooltip';

interface GalleryCardProps {
    item: GalleryItem;
    channelTitle: string;
    channelAvatar: string;
    onDelete: () => void;
    onDownload: () => void;
    onRate: (rating: 1 | 0 | -1) => void;
    isDragEnabled: boolean;
    // New action handlers
    onConvertToVideo?: () => void;
    onConvertToVideoInPlaylist?: () => void;
    onCloneToHome?: () => void;
    onCloneToPlaylist?: () => void;
    onSetAsCover?: () => void;
    isConverting?: boolean;
    isCloning?: boolean;
    isSettingCover?: boolean;
    onClick?: () => void;
    rankingOverlay?: number | null;
    onImageLoaded?: () => void;
    // Selection support
    isSelected?: boolean;
    onToggleSelection?: () => void;
    isSelectionMode?: boolean;
}

// Export Inner component for use in Ghost
export interface GalleryCardInnerProps extends GalleryCardProps {
    isOverlay?: boolean;
    style?: React.CSSProperties;
    dragAttributes?: import('@dnd-kit/core').DraggableAttributes;
    dragListeners?: import('@dnd-kit/core/dist/hooks/utilities').SyntheticListenerMap;
    innerRef?: (node: HTMLElement | null) => void;
    className?: string;
}

export const GalleryCardInner: React.FC<GalleryCardInnerProps> = ({
    item,
    channelTitle,
    channelAvatar,
    onDelete,
    onDownload,
    onRate,
    isDragEnabled,
    isOverlay = false,
    style,
    dragAttributes,
    dragListeners,
    innerRef,
    className,
    onConvertToVideo,
    onConvertToVideoInPlaylist,
    onCloneToHome,
    onCloneToPlaylist,
    onSetAsCover,
    isConverting = false,
    isCloning = false,
    isSettingCover = false,
    onClick,
    rankingOverlay,
    onImageLoaded,
    isSelected,
    onToggleSelection,
    isSelectionMode
}) => {
    const [showMenu, setShowMenu] = useState(false);
    const [showInfoTooltip, setShowInfoTooltip] = useState(false);
    const [copied, setCopied] = useState(false);
    const [confirmDelete, setConfirmDelete] = useState(false);

    // Download handler with loading state
    const [isDownloading, setIsDownloading] = useState(false);

    const handleDownload = async (e?: React.MouseEvent) => {
        e?.stopPropagation();
        if (isDownloading) return;

        setIsDownloading(true);
        try {
            await onDownload();
        } finally {
            setIsDownloading(false);
            setShowMenu(false); // Close menu after download
        }
    };

    // Image loading state
    // For overlay (ghost), skip loading animation - image is already cached
    const [isImageLoaded, setIsImageLoaded] = useState(isOverlay);

    // Format filename (remove extension for display)
    const displayName = item.filename.replace(/\.[^/.]+$/, '');

    // Format upload date
    const uploadDate = new Date(item.uploadedAt).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
    });

    // Format file size
    const formatFileSize = (bytes?: number) => {
        if (!bytes) return '';
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
        return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    };

    // Copy filename to clipboard
    const handleCopy = async (e?: React.MouseEvent) => {
        e?.stopPropagation();
        await navigator.clipboard.writeText(item.filename);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    // Handle delete with confirmation
    const handleDeleteClick = () => {
        if (confirmDelete) {
            onDelete();
            setShowMenu(false);
            setConfirmDelete(false);
        } else {
            setConfirmDelete(true);
            setTimeout(() => setConfirmDelete(false), 3000);
        }
    };

    // Determine visual state
    // If overlay, force hover state active
    const isActive = isOverlay || showMenu || showInfoTooltip || isSelected;

    const handleCardClick = (e: React.MouseEvent) => {
        // Cmd/Ctrl + Click or click in selection mode → toggle selection
        if ((e.metaKey || e.ctrlKey || isSelectionMode) && onToggleSelection) {
            e.preventDefault();
            e.stopPropagation();
            onToggleSelection();
            return;
        }
        // Normal click → delegate to onClick (Pick the Winner, etc.)
        onClick?.();
    };

    return (
        <div
            ref={innerRef}
            style={style}
            {...(isDragEnabled ? { ...dragAttributes, ...dragListeners } : {})}
            className={`
                group relative flex flex-col gap-2 p-[6px] rounded-xl isolate
                ${isDragEnabled && !isOverlay ? 'cursor-grab active:cursor-grabbing' : ''}
                ${isOverlay ? 'cursor-grabbing' : 'cursor-pointer'}
                ${className || ''}
                ${showMenu ? 'z-[100]' : ''}
                ${isSelected ? 'ring-2 ring-blue-500 bg-blue-500/10' : ''}
            `}
            onClick={handleCardClick}
        >
            {/* Selection Checkbox */}
            {onToggleSelection && (
                <div
                    className={`absolute top-2 left-2 z-30 transition-all duration-200 ${isSelected ? 'opacity-100 scale-100' : 'opacity-0 scale-90 pointer-events-none'}`}
                    onClick={(e) => {
                        e.stopPropagation();
                        onToggleSelection();
                    }}
                >
                    <div className={`w-5 h-5 rounded-md border flex items-center justify-center transition-colors ${isSelected ? 'bg-blue-500 border-blue-500' : 'bg-black/40 border-white/50 hover:bg-black/60 hover:border-white'}`}>
                        {isSelected && <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="text-white"><polyline points="20 6 9 17 4 12"></polyline></svg>}
                    </div>
                </div>
            )}

            {/* Hover Substrate - matching VideoCard */}
            <div className={`absolute inset-0 rounded-xl transition-all duration-200 ease-out -z-10 pointer-events-none 
                ${isActive ? 'opacity-100 scale-100' : 'opacity-0 scale-90 group-hover:opacity-100 group-hover:scale-100'} 
                ${isSelected ? 'bg-blue-500/5 border-2 border-blue-500/50' : 'bg-white/10 border-2 border-white/20'}`}
            />
            {/* Thumbnail */}
            <div className="relative aspect-video rounded-xl overflow-hidden bg-[#1a1a1a] flex items-center justify-center">

                {/* Loader - visible while loading */}
                {!isImageLoaded && (
                    <div className="absolute inset-0 flex items-center justify-center z-20">
                        <Loader2 size={32} className="text-white/60 animate-spin" />
                    </div>
                )}

                <img
                    src={item.thumbnailUrl}
                    alt={item.filename}
                    className={`w-full h-full object-cover transition-all duration-500 
                        ${isActive ? 'scale-105' : 'group-hover:scale-105'}
                        ${isImageLoaded ? 'opacity-100' : 'opacity-0'}
                    `}
                    loading="lazy"
                    onLoad={() => {
                        setIsImageLoaded(true);
                        onImageLoaded?.();
                    }}
                />

                {/* Info icon (top-right) - matching VideoCard pattern */}
                <div className={`absolute top-2 right-2 z-10 transition-opacity duration-200 ${isOverlay ? 'opacity-100' : (showInfoTooltip ? 'opacity-100' : 'opacity-0 group-hover:opacity-100')}`}>
                    <PortalTooltip
                        content={
                            <div className="flex flex-col gap-1.5">
                                {/* Header Row: Filename + Action Buttons */}
                                <div className="flex items-start justify-between gap-3">
                                    <div className="font-medium text-white text-sm break-words max-w-[200px]">
                                        {item.filename}
                                    </div>
                                    <div className="flex items-center gap-0.5">
                                        <button
                                            onClick={(e) => { e.stopPropagation(); handleCopy(e); }}
                                            className="p-1 rounded hover:bg-white/10 text-white transition-colors border-none cursor-pointer flex-shrink-0"
                                            title="Copy filename"
                                        >
                                            {copied ? <Check size={12} className="text-green-400" /> : <Copy size={12} />}
                                        </button>
                                        <button
                                            onClick={handleDownload}
                                            disabled={isDownloading}
                                            className="p-1 rounded hover:bg-white/10 text-white transition-colors border-none cursor-pointer flex-shrink-0 disabled:opacity-50 disabled:cursor-wait"
                                            title="Download"
                                        >
                                            {isDownloading ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />}
                                        </button>
                                        <button
                                            onClick={(e) => { e.stopPropagation(); handleDeleteClick(); }}
                                            className={`p-1 rounded flex items-center justify-center transition-all border-none cursor-pointer flex-shrink-0 ${confirmDelete
                                                ? 'bg-red-600 scale-110 shadow-lg shadow-red-500/20'
                                                : 'hover:bg-white/10'
                                                } text-white`}
                                            title={confirmDelete ? "Click again to confirm" : "Delete"}
                                        >
                                            {confirmDelete ? <AlertCircle size={12} /> : <Trash2 size={12} />}
                                        </button>
                                    </div>
                                </div>
                                {/* File info */}
                                <div className="text-xs text-gray-300">
                                    {uploadDate} {item.fileSize ? `• ${formatFileSize(item.fileSize)}` : ''}
                                </div>

                                {/* Rating Actions (New Row) */}
                                <div className="flex items-center gap-2 pt-2 mt-2 border-t border-[#ffffff20]">
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            // Toggle Dislike
                                            onRate(item.rating === -1 ? 0 : -1);
                                        }}
                                        className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded transition-colors ${item.rating === -1
                                            ? 'bg-red-500/20 text-red-500 hover:bg-red-500/30'
                                            : 'hover:bg-white/10 text-white'
                                            }`}
                                        title="Dislike"
                                    >
                                        <ThumbsDown size={14} className={item.rating === -1 ? "fill-current" : ""} />
                                        <span className="text-xs font-medium">Dislike</span>
                                    </button>
                                    <div className="w-[1px] h-4 bg-[#ffffff20]" />
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            // Toggle Like
                                            onRate(item.rating === 1 ? 0 : 1);
                                        }}
                                        className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded transition-colors ${(item.rating === 1 || item.isLiked) // Support legacy isLiked
                                            ? 'bg-red-500/20 text-red-500 hover:bg-red-500/30'
                                            : 'hover:bg-white/10 text-white'
                                            }`}
                                        title="Like"
                                    >
                                        <Heart size={14} className={(item.rating === 1 || item.isLiked) ? "fill-current" : ""} />
                                        <span className="text-xs font-medium">Like</span>
                                    </button>
                                </div>


                            </div>
                        }
                        align="right"
                        onOpenChange={setShowInfoTooltip}
                    >
                        <div className="w-10 h-10 rounded-full bg-[var(--modal-overlay)] text-white flex items-center justify-center backdrop-blur-sm border-none cursor-help">
                            <Info size={20} />
                        </div>
                    </PortalTooltip>
                </div>

                {/* Rating Badge */}
                {(item.isLiked || item.rating === 1) && (
                    <div className="absolute top-2 left-2">
                        <Heart size={16} className="text-red-500" fill="currentColor" />
                    </div>
                )}
                {item.rating === -1 && (
                    <div className="absolute top-2 left-2">
                        <ThumbsDown size={16} className="text-red-500" fill="currentColor" />
                    </div>
                )}

                {/* Pick the Winner Ranking Overlay */}
                {rankingOverlay != null && (
                    <div className="absolute inset-0 z-20 bg-black/50 backdrop-blur-[2px] flex items-center justify-center animate-in fade-in zoom-in duration-200">
                        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shadow-2xl shadow-amber-500/30 border border-amber-300/30">
                            <span className="text-2xl font-black text-black">{rankingOverlay}</span>
                        </div>
                    </div>
                )}
            </div>

            {/* Content */}
            <div className="flex gap-3">
                {/* Channel Avatar */}
                <div className="w-9 h-9 rounded-full overflow-hidden flex-shrink-0 bg-[#333]">
                    {channelAvatar ? (
                        <img src={channelAvatar} alt={channelTitle} className="w-full h-full object-cover" />
                    ) : (
                        <div className="w-full h-full flex items-center justify-center text-xs text-text-secondary">
                            {channelTitle.charAt(0)}
                        </div>
                    )}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-medium text-text-primary line-clamp-2 leading-tight">
                        {displayName}
                    </h3>
                    <p className="text-xs text-text-secondary mt-1">{channelTitle}</p>
                    <p className="text-xs text-text-secondary">
                        {GALLERY_CARD_DEFAULTS.viewCount} views • {uploadDate}
                    </p>
                </div>

                {/* Menu button */}
                <div className="relative">
                    <button
                        onClick={() => setShowMenu(!showMenu)}
                        className={`p-1 rounded-full transition-all ${isOverlay ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 hover:bg-[#ffffff10]'}`}
                    >
                        <MoreVertical size={18} className="text-text-secondary" />
                    </button>

                    {showMenu && (
                        <>
                            {/* Backdrop */}
                            <div
                                className="fixed inset-0 z-40"
                                onClick={() => {
                                    setShowMenu(false);
                                    setConfirmDelete(false);
                                }}
                            />

                            {/* Menu */}
                            <div className="absolute right-0 top-8 w-max min-w-[12rem] py-1 bg-[#282828] rounded-lg shadow-xl border border-border z-50 flex flex-col">
                                {/* Set as Cover (First priority) */}
                                {onSetAsCover && (
                                    <>
                                        <button
                                            onClick={() => { onSetAsCover(); setShowMenu(false); }}
                                            disabled={isSettingCover}
                                            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-text-primary hover:bg-[#ffffff10] transition-colors disabled:opacity-50"
                                        >
                                            {isSettingCover ? <Loader2 size={16} className="animate-spin" /> : <ImageIcon size={16} />}
                                            Make Cover
                                        </button>
                                        <div className="my-1 mx-2 border-t border-[#ffffff20]" />
                                    </>
                                )}

                                {/* Convert/Clone Actions */}
                                {onConvertToVideo && (
                                    <button
                                        onClick={() => { onConvertToVideo(); setShowMenu(false); }}
                                        disabled={isConverting}
                                        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-text-primary hover:bg-[#ffffff10] transition-colors disabled:opacity-50"
                                    >
                                        {isConverting ? <Loader2 size={16} className="animate-spin" /> : <Video size={16} />}
                                        Convert to Video
                                    </button>
                                )}
                                {onConvertToVideoInPlaylist && (
                                    <button
                                        onClick={() => { onConvertToVideoInPlaylist(); setShowMenu(false); }}
                                        disabled={isConverting}
                                        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-text-primary hover:bg-[#ffffff10] transition-colors disabled:opacity-50"
                                    >
                                        <ListPlus size={16} />
                                        Convert to Video in Playlist
                                    </button>
                                )}

                                {/* Separator between Convert and Clone */}
                                {(onConvertToVideo || onConvertToVideoInPlaylist) && (onCloneToHome || onCloneToPlaylist) && (
                                    <div className="my-1 mx-2 border-t border-[#ffffff20]" />
                                )}

                                {onCloneToHome && (
                                    <button
                                        onClick={() => { onCloneToHome(); setShowMenu(false); }}
                                        disabled={isCloning}
                                        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-text-primary hover:bg-[#ffffff10] transition-colors disabled:opacity-50"
                                    >
                                        {isCloning ? <Loader2 size={16} className="animate-spin" /> : <Clock size={16} />}
                                        Clone to Home
                                    </button>
                                )}
                                {onCloneToPlaylist && (
                                    <button
                                        onClick={() => { onCloneToPlaylist(); setShowMenu(false); }}
                                        disabled={isCloning}
                                        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-text-primary hover:bg-[#ffffff10] transition-colors disabled:opacity-50"
                                    >
                                        <Clock size={16} />
                                        Clone to Playlist
                                    </button>
                                )}

                                {/* Separator if any action exists */}
                                {(onConvertToVideo || onCloneToHome) && (
                                    <div className="my-1 mx-2 border-t border-[#ffffff20]" />
                                )}

                                <button
                                    onClick={handleDownload}
                                    disabled={isDownloading}
                                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-text-primary hover:bg-[#ffffff10] transition-colors disabled:opacity-50 disabled:cursor-wait"
                                >
                                    {isDownloading ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
                                    {isDownloading ? 'Downloading...' : 'Download'}
                                </button>
                                <button
                                    onClick={handleDeleteClick}
                                    className={`w-full flex items-center gap-2 px-3 py-2 text-sm transition-colors ${confirmDelete
                                        ? 'text-red-500 bg-red-500/10'
                                        : 'text-text-primary hover:bg-[#ffffff10]'
                                        }`}
                                >
                                    <Trash2 size={16} />
                                    {confirmDelete ? 'Click to confirm' : 'Delete'}
                                </button>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};

export const GalleryCard: React.FC<GalleryCardProps> = ({
    item,
    channelTitle,
    channelAvatar,
    onDelete,
    onDownload,
    onRate,
    isDragEnabled,
    onConvertToVideo,
    onConvertToVideoInPlaylist,
    onCloneToHome,
    onCloneToPlaylist,
    onSetAsCover,
    isConverting,
    isCloning,
    isSettingCover,
    onClick,
    rankingOverlay,
    onImageLoaded,
    isSelected,
    onToggleSelection,
    isSelectionMode
}) => {

    // Sortable setup
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging
    } = useSortable({
        id: item.id,
        disabled: !isDragEnabled
    });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0 : 1, // Hidden during drag - ghost shown via DragOverlay
        zIndex: isDragging ? 100 : undefined
    };

    return (
        <GalleryCardInner
            item={item}
            channelTitle={channelTitle}
            channelAvatar={channelAvatar}
            onDelete={onDelete}
            onDownload={onDownload}
            onRate={onRate}
            isDragEnabled={isDragEnabled}
            innerRef={setNodeRef}
            style={style}
            dragAttributes={attributes}
            dragListeners={listeners}
            onConvertToVideo={onConvertToVideo}
            onConvertToVideoInPlaylist={onConvertToVideoInPlaylist}
            onCloneToHome={onCloneToHome}
            onCloneToPlaylist={onCloneToPlaylist}
            onSetAsCover={onSetAsCover}
            isConverting={isConverting}
            isCloning={isCloning}
            isSettingCover={isSettingCover}
            onClick={onClick}
            rankingOverlay={rankingOverlay}
            onImageLoaded={onImageLoaded}
            isSelected={isSelected}
            onToggleSelection={onToggleSelection}
            isSelectionMode={isSelectionMode}
        />
    );
};
