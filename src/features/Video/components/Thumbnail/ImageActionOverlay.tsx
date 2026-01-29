import React, { useState } from 'react';
import { Info, Trash2, Copy, Loader2, Check, AlertCircle } from 'lucide-react';
import { PortalTooltip } from '../../../../components/ui/atoms/PortalTooltip';
import { ClonedVideoTooltipContent } from '../../../../features/Video/ClonedVideoTooltipContent';

interface ImageActionOverlayProps {
    version: number;
    originalName?: string;
    onDelete?: () => void;
    onClone?: () => void;
    isCloning?: boolean;
    isCloned?: boolean;
    className?: string;
    size?: 'default' | 'small';
    onTooltipOpenChange?: (open: boolean) => void;
    isLiked?: boolean;
    onLike?: () => void;
    onRemove?: () => void;
}

export const ImageActionOverlay: React.FC<ImageActionOverlayProps> = ({
    version,
    originalName,
    onDelete,
    onClone,
    isCloning,
    isCloned,
    className = '',
    size = 'default',
    onTooltipOpenChange,
    isLiked,
    onLike,
    onRemove
}) => {
    const [isTooltipOpen, setIsTooltipOpen] = useState(false);
    const [confirmDelete, setConfirmDelete] = useState(false);
    const [showCloneSuccess, setShowCloneSuccess] = useState(false);

    const handleTooltipOpenChange = (open: boolean) => {
        setIsTooltipOpen(open);
        onTooltipOpenChange?.(open);
    };

    const handleDelete = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (!confirmDelete) {
            setConfirmDelete(true);
            setTimeout(() => setConfirmDelete(false), 3000);
            return;
        }
        onDelete?.();
        setConfirmDelete(false);
    };

    const handleClone = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (!isCloned && !isCloning && onClone) {
            onClone();
            setShowCloneSuccess(true);
            setTimeout(() => setShowCloneSuccess(false), 2000);
        }
    };

    const buttonSizeClass = size === 'small' ? 'w-6 h-6' : 'w-8 h-8';
    const cloneButtonSizeClass = size === 'small' ? 'w-7 h-7' : 'w-9 h-9';
    const iconSize = size === 'small' ? 12 : 14;
    const loaderSize = size === 'small' ? 14 : 16;

    return (
        <div className={`absolute inset-0 transition-opacity duration-200 ${isTooltipOpen ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'} ${className}`}>

            {size === 'small' ? (
                // Small Layout (Thumbnail Carousel)
                <>
                    {/* Info - Top Left */}
                    <div className="absolute top-1 left-1">
                        <PortalTooltip
                            content={
                                <ClonedVideoTooltipContent
                                    version={version}
                                    filename={originalName || 'Unknown Filename'}
                                    isLiked={isLiked}
                                    onLike={onLike}
                                    onRemove={onRemove}
                                />
                            }
                            align="left"
                            side="bottom"
                            onOpenChange={handleTooltipOpenChange}
                        >
                            <button className={`${buttonSizeClass} rounded-full bg-black/60 hover:bg-black/60 text-white flex items-center justify-center transition-colors border-none cursor-pointer shadow-sm`}>
                                <Info size={iconSize} />
                            </button>
                        </PortalTooltip>
                    </div>

                    {/* Delete - Bottom Right */}
                    {onDelete && (
                        <div className="absolute bottom-1 right-1">
                            <button
                                onClick={handleDelete}
                                className={`${buttonSizeClass} rounded-full flex items-center justify-center transition-all border-none cursor-pointer shadow-sm
                                    ${confirmDelete
                                        ? 'bg-red-600 scale-110 shadow-lg shadow-red-500/20'
                                        : 'bg-black/60 hover:bg-red-500'} text-white`}
                                title={confirmDelete ? "Click again to confirm delete" : "Delete Version"}
                            >
                                {confirmDelete ? <AlertCircle size={iconSize} /> : <Trash2 size={iconSize} />}
                            </button>
                        </div>
                    )}
                </>
            ) : (
                // Default Layout (Main Previews)
                <div className="flex flex-col justify-between h-full p-2">
                    <div className="flex justify-between w-full">
                        {/* Info / Filename */}
                        <PortalTooltip
                            content={
                                <ClonedVideoTooltipContent
                                    version={version}
                                    filename={originalName || 'Unknown Filename'}
                                    isLiked={isLiked}
                                    onLike={onLike}
                                    onRemove={onRemove}
                                />
                            }
                            align="left"
                            side="bottom"
                            onOpenChange={handleTooltipOpenChange}
                        >
                            <button className={`${buttonSizeClass} rounded-full bg-black/60 hover:bg-black/60 text-white flex items-center justify-center transition-colors border-none cursor-pointer shadow-md`}>
                                <Info size={iconSize} />
                            </button>
                        </PortalTooltip>

                        {/* Delete */}
                        {onDelete && (
                            <button
                                onClick={handleDelete}
                                className={`${buttonSizeClass} rounded-full flex items-center justify-center transition-all border-none cursor-pointer shadow-md
                                    ${confirmDelete
                                        ? 'bg-red-600 scale-110 shadow-lg shadow-red-500/20'
                                        : 'bg-black/60 hover:bg-red-500'} text-white`}
                                title={confirmDelete ? "Click again to confirm delete" : "Delete Version"}
                            >
                                {confirmDelete ? (
                                    <div className="flex items-center gap-1 px-1">
                                        <AlertCircle size={iconSize} />
                                    </div>
                                ) : <Trash2 size={iconSize} />}
                            </button>
                        )}
                    </div>

                    {/* Bottom Actions (Clone) */}
                    <div className="flex justify-center pb-1">
                        {onClone && (
                            <button
                                onClick={handleClone}
                                disabled={isCloned || isCloning}
                                className={`${cloneButtonSizeClass} rounded-full flex items-center justify-center transition-all shadow-lg border cursor-pointer
                                    ${showCloneSuccess
                                        ? 'bg-green-500 border-green-400 scale-110'
                                        : isCloned
                                            ? 'bg-gray-500/50 text-gray-300 cursor-not-allowed border-transparent'
                                            : 'bg-black/60 text-white hover:bg-green-500 hover:text-white border-white/10 hover:border-transparent hover:scale-105'
                                    }`}
                                title={showCloneSuccess ? "Done!" : isCloned ? "Active clone with this thumbnail already exists" : "Clone Video from this version"}
                            >
                                {showCloneSuccess ? (
                                    <Check size={iconSize + 2} className="text-white" />
                                ) : isCloning ? (
                                    <Loader2 size={loaderSize} className="animate-spin" />
                                ) : (
                                    <Copy size={iconSize} />
                                )}
                            </button>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};
