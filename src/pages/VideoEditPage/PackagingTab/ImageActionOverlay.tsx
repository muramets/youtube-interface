import React, { useState } from 'react';
import { Info, Trash2, Copy, Loader2 } from 'lucide-react';
import { PortalTooltip } from '../../../components/Shared/PortalTooltip';
import { ClonedVideoTooltipContent } from '../../../components/Video/ClonedVideoTooltipContent';

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
    onTooltipOpenChange
}) => {
    const [isTooltipOpen, setIsTooltipOpen] = useState(false);

    const handleTooltipOpenChange = (open: boolean) => {
        setIsTooltipOpen(open);
        onTooltipOpenChange?.(open);
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
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onDelete();
                                }}
                                className={`${buttonSizeClass} rounded-full bg-black/60 hover:bg-red-500 text-white flex items-center justify-center transition-colors border-none cursor-pointer shadow-sm`}
                                title="Delete Version"
                            >
                                <Trash2 size={iconSize} />
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
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onDelete();
                                }}
                                className={`${buttonSizeClass} rounded-full bg-black/60 hover:bg-red-500 text-white flex items-center justify-center transition-colors border-none cursor-pointer shadow-md`}
                                title="Delete Version"
                            >
                                <Trash2 size={iconSize} />
                            </button>
                        )}
                    </div>

                    {/* Bottom Actions (Clone) */}
                    <div className="flex justify-center pb-1">
                        {onClone && (
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    if (!isCloned && !isCloning) onClone();
                                }}
                                disabled={isCloned || isCloning}
                                className={`${cloneButtonSizeClass} rounded-full flex items-center justify-center transition-all shadow-lg border cursor-pointer
                                    ${isCloned
                                        ? 'bg-gray-500/50 text-gray-300 cursor-not-allowed border-transparent'
                                        : 'bg-black/60 text-white hover:bg-green-500 hover:text-white border-white/10 hover:border-transparent hover:scale-105'
                                    }`}
                                title={isCloned ? "Active clone already exists" : "Clone Video from this version"}
                            >
                                {isCloning ? (
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
