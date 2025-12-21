import React, { useRef, useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight, Info, Trash2, ArrowUp, Copy, Loader2, FlaskConical } from 'lucide-react';
import { PortalTooltip } from '../../../components/Shared/PortalTooltip';
import { ClonedVideoTooltipContent } from '../ClonedVideoTooltipContent';
import { type VideoDetails, type CoverVersion } from '../../../core/utils/youtubeApi';
import { useVideos } from '../../../core/hooks/useVideos';

import { useAuth } from '../../../core/hooks/useAuth';
import { useChannelStore } from '../../../core/stores/channelStore';

interface VersionHistoryProps {
    history: CoverVersion[];
    isLoading: boolean;
    onRestore: (version: CoverVersion) => void;
    onDelete: (e: React.MouseEvent, timestamp: number, immediate?: boolean) => void;
    onClone?: (version: CoverVersion) => void;
    initialData?: VideoDetails;
    cloningVersion: number | null;
    currentVersion: number;
    abTestVariants?: string[];
    onAddToAbTest?: (url: string) => void;
}

export const VersionHistory: React.FC<VersionHistoryProps> = ({
    history,
    isLoading,
    onRestore,
    onDelete,
    onClone,
    initialData,
    cloningVersion,
    currentVersion,
    abTestVariants,
    onAddToAbTest
}) => {
    const { user } = useAuth();
    const { currentChannel } = useChannelStore();
    const { videos } = useVideos(user?.uid || '', currentChannel?.id || '');
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

    useEffect(() => {
        const container = scrollContainerRef.current;
        if (container) {
            const handleWheel = (e: WheelEvent) => {
                // Aggressively prevent parent scrolling
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();

                // Map both vertical and horizontal scroll energy to horizontal scrolling
                // This ensures any movement scrolls the history, and NEVER the parent
                const delta = e.deltaY + e.deltaX;

                container.scrollBy({
                    left: delta * 1.5,
                    behavior: 'auto'
                });
            };

            // We must use { passive: false } to be able to preventDefault
            container.addEventListener('wheel', handleWheel, { passive: false });

            return () => {
                container.removeEventListener('wheel', handleWheel);
            };
        }
    }, [history, isLoading]);

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
                ) : history.length === 0 ? (
                    <div className="absolute inset-0 flex items-center justify-center text-text-secondary text-sm italic">
                        {currentVersion > 1 ? 'Previous versions were deleted' : 'No history yet'}
                    </div>
                ) : (
                    <>
                        {showLeftArrow && (
                            <div className="absolute left-0 top-0 z-10 flex items-center bg-gradient-to-r from-modal-surface via-modal-surface to-transparent pr-8 pl-0 h-full">
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
                            style={{ overscrollBehavior: 'contain' }}
                        >
                            {history.map((version) => (
                                <HistoryItem
                                    key={version.timestamp}
                                    version={version}
                                    onDelete={onDelete}
                                    onRestore={onRestore}
                                    onClone={onClone}
                                    onAddToAbTest={onAddToAbTest}
                                    initialData={initialData}
                                    cloningVersion={cloningVersion}
                                    videos={videos}
                                    abTestVariants={abTestVariants}
                                />
                            ))}
                        </div>

                        {showRightArrow && (
                            <div className="absolute right-0 top-0 z-10 flex items-center bg-gradient-to-l from-modal-surface via-modal-surface to-transparent pl-8 pr-0 h-full">
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

interface HistoryItemProps {
    version: CoverVersion;
    onDelete: (e: React.MouseEvent, timestamp: number, immediate?: boolean) => void;
    onRestore: (version: CoverVersion) => void;
    onClone?: (version: CoverVersion) => void;
    onAddToAbTest?: (url: string) => void;
    initialData?: VideoDetails;
    cloningVersion: number | null;
    videos: VideoDetails[];
    abTestVariants?: string[];
}

const HistoryItem: React.FC<HistoryItemProps> = ({
    version,
    onDelete,
    onRestore,
    onClone,
    onAddToAbTest,
    initialData,
    cloningVersion,
    videos,
    abTestVariants
}) => {
    const [isLoaded, setIsLoaded] = useState(false);
    const [hasError, setHasError] = useState(false);

    return (
        <div className="flex-shrink-0 w-36 group relative">
            <div className="aspect-video border border-border relative rounded-md bg-bg-primary overflow-hidden">
                {/* Skeleton Loader */}
                {!isLoaded && !hasError && (
                    <div className="absolute inset-0 bg-bg-primary z-0">
                        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent animate-shimmer" style={{ backgroundSize: '200% 100%' }}></div>
                    </div>
                )}

                {/* Broken Image State */}
                {hasError && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-bg-secondary text-text-secondary">
                        <Trash2 size={24} className="mb-1 opacity-50" />
                        <span className="text-[10px] uppercase font-bold tracking-wider">File Missing</span>
                    </div>
                )}

                {!hasError && (
                    <img
                        src={version.url}
                        alt={`v.${version.version}`}
                        className={`w-full h-full object-cover transition-all duration-500 rounded-md ${isLoaded ? 'opacity-70 group-hover:opacity-40' : 'opacity-0'}`}
                        onLoad={() => setIsLoaded(true)}
                        onError={() => {
                            setHasError(true);
                            setIsLoaded(true); // Stop skeleton
                        }}
                    />
                )}

                {/* Overlay Actions - Show always for broken images to allow delete, otherwise on hover */}
                <div className={`absolute inset-0 transition-opacity duration-200 flex flex-col justify-between p-2 rounded-md ${hasError ? 'opacity-100' : (isLoaded ? 'opacity-0 group-hover:opacity-100' : 'opacity-0 pointer-events-none')}`}>
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
                            onClick={(e) => onDelete(e, version.timestamp, hasError)} // Pass hasError as immediate/force flag
                            className={`w-6 h-6 rounded-full flex items-center justify-center backdrop-blur-sm transition-all border border-white/10 hover:border-transparent ${hasError ? 'bg-red-500/80 text-white hover:bg-red-600' : 'bg-black/40 hover:bg-red-500 text-white/90 hover:text-white'}`}
                            title="Delete Version"
                        >
                            <Trash2 size={12} />
                        </button>
                    </div>

                    {!hasError && (
                        <div className="absolute inset-0 flex items-end justify-center pointer-events-none gap-2 pb-3">
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
                                            className={`w-7 h-7 rounded-full flex items-center justify-center backdrop-blur-sm transition-all transform scale-90 hover:scale-100 shadow-lg border cursor-pointer pointer-events-auto ${isCloned
                                                ? 'bg-gray-500/50 text-gray-300 cursor-not-allowed hover:scale-90 border-transparent'
                                                : 'bg-black/40 text-white/90 hover:bg-green-500 hover:text-white border-white/10 hover:border-transparent'
                                                }`}
                                            title={isCloned ? "Active clone already exists" : "Clone Video"}
                                        >
                                            {cloningVersion === version.version ? (
                                                <Loader2 size={14} className="animate-spin" />
                                            ) : (
                                                <Copy size={14} strokeWidth={2.5} />
                                            )}
                                        </button>
                                    );
                                })()
                            )}

                            <button
                                onClick={() => onRestore(version)}
                                className="w-7 h-7 rounded-full bg-black/40 hover:bg-[#3ea6ff] text-white/90 hover:text-black flex items-center justify-center backdrop-blur-sm transition-all transform scale-90 hover:scale-100 shadow-lg border border-white/10 hover:border-transparent cursor-pointer pointer-events-auto"
                                title="Make Current"
                            >
                                <ArrowUp size={16} strokeWidth={2.5} />
                            </button>

                            {onAddToAbTest && abTestVariants && (
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onAddToAbTest(version.url);
                                    }}
                                    className={`w-7 h-7 rounded-full flex items-center justify-center backdrop-blur-sm transition-all transform scale-90 hover:scale-100 shadow-lg border cursor-pointer pointer-events-auto ${abTestVariants.includes(version.url)
                                        ? 'bg-purple-500 text-white border-transparent'
                                        : 'bg-black/40 text-white/90 hover:bg-purple-500 hover:text-white border-white/10 hover:border-transparent'
                                        }`}
                                    title={abTestVariants.includes(version.url) ? "Remove from A/B Test" : "A/B Test"}
                                >
                                    <FlaskConical size={14} strokeWidth={abTestVariants.includes(version.url) ? 3 : 2} className={abTestVariants.includes(version.url) ? "fill-current" : ""} />
                                </button>
                            )}
                        </div>
                    )}
                </div>
            </div>
            <div className="flex justify-between items-center mt-1 px-1">
                <span className="text-xs text-text-secondary font-medium">v.{version.version}</span>
                <span className="text-[10px] text-text-secondary">{new Date(version.timestamp).toLocaleDateString()}</span>
            </div>
        </div>
    );
};
