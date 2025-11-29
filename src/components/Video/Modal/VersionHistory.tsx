import React, { useRef, useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight, Info, Trash2, ArrowUp, Copy, Loader2 } from 'lucide-react';
import { PortalTooltip } from '../../Shared/PortalTooltip';
import { ClonedVideoTooltipContent } from '../ClonedVideoTooltipContent';
import { type VideoDetails, type CoverVersion } from '../../../utils/youtubeApi';
import { useVideosStore } from '../../../stores/videosStore';

interface VersionHistoryProps {
    history: CoverVersion[];
    isLoading: boolean;
    onRestore: (version: CoverVersion) => void;
    onDelete: (e: React.MouseEvent, timestamp: number) => void;
    onClone?: (version: CoverVersion) => void;
    initialData?: VideoDetails;
    cloningVersion: number | null;
}

export const VersionHistory: React.FC<VersionHistoryProps> = ({
    history,
    isLoading,
    onRestore,
    onDelete,
    onClone,
    initialData,
    cloningVersion
}) => {
    const { videos } = useVideosStore();
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
            setTimeout(checkScroll, 100);
            return () => {
                container.removeEventListener('scroll', checkScroll);
                window.removeEventListener('resize', checkScroll);
            };
        }
    }, [history]);

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
            if (Math.abs(e.deltaY) > Math.abs(e.deltaX) * 1.5) {
                scrollContainerRef.current.scrollLeft += e.deltaY;
            }
        }
    };

    if (history.length === 0 && !isLoading) return null;

    return (
        <div className="flex flex-col gap-2">
            <label className="text-xs text-text-secondary uppercase tracking-wider font-bold">Version History</label>

            <div className="relative w-full group/history min-h-[100px]">
                {isLoading ? (
                    <div className="flex gap-3 overflow-hidden">
                        {[1, 2, 3].map((i) => (
                            <div key={i} className="flex-shrink-0 w-36 aspect-video rounded-md bg-bg-primary border border-border relative overflow-hidden">
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
                            {history.map((version) => (
                                <div key={version.timestamp} className="flex-shrink-0 w-36 group relative">
                                    <div className="aspect-video border border-border relative rounded-md">
                                        <img src={version.url} alt={`v.${version.version}`} className="w-full h-full object-cover opacity-70 group-hover:opacity-40 transition-all duration-300 rounded-md" />

                                        <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex flex-col justify-between p-2 rounded-md">
                                            <div className="flex justify-between w-full">
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

                                                <button
                                                    onClick={(e) => onDelete(e, version.timestamp)}
                                                    className="w-6 h-6 rounded-full bg-red-500/80 hover:bg-red-600 text-white flex items-center justify-center backdrop-blur-sm transition-colors border-none cursor-pointer"
                                                    title="Delete Version"
                                                >
                                                    <Trash2 size={12} />
                                                </button>
                                            </div>

                                            <div className="absolute inset-0 flex items-center justify-center pointer-events-none gap-2">
                                                <button
                                                    onClick={() => onRestore(version)}
                                                    className="w-8 h-8 rounded-full bg-[#3ea6ff]/90 hover:bg-[#3ea6ff] text-black flex items-center justify-center backdrop-blur-sm transition-all transform scale-90 hover:scale-100 shadow-lg border-none cursor-pointer pointer-events-auto"
                                                    title="Set as Main Cover"
                                                >
                                                    <ArrowUp size={18} strokeWidth={3} />
                                                </button>

                                                {onClone && initialData && (
                                                    (() => {
                                                        const isCloned = videos.some((v: VideoDetails) =>
                                                            v.isCloned &&
                                                            v.clonedFromId === initialData.id &&
                                                            v.customImageVersion === version.version
                                                        );

                                                        return (
                                                            <button
                                                                onClick={(e) => {
                                                                    if (isCloned || cloningVersion !== null) return;
                                                                    e.stopPropagation();
                                                                    onClone(version);
                                                                }}
                                                                disabled={isCloned || cloningVersion !== null}
                                                                className={`w-8 h-8 rounded-full flex items-center justify-center backdrop-blur-sm transition-all transform scale-90 hover:scale-100 shadow-lg border-none cursor-pointer pointer-events-auto ${isCloned
                                                                    ? 'bg-gray-500/50 text-gray-300 cursor-not-allowed hover:scale-90'
                                                                    : 'bg-green-500/90 hover:bg-green-600 text-white'
                                                                    }`}
                                                                title={isCloned ? "Active clone already exists" : "Clone as a New Temporary Video"}
                                                            >
                                                                {cloningVersion === version.version ? (
                                                                    <Loader2 size={16} className="animate-spin" />
                                                                ) : (
                                                                    <Copy size={16} strokeWidth={2.5} />
                                                                )}
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
    );
};
