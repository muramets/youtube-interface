import { memo, useState } from 'react';
import { Play, Film } from 'lucide-react';

// =============================================================================
// ThumbnailCell — Video thumbnail with premium hover effects
//
// Features:
// - Lazy loading with pulse placeholder
// - Hover: scale + brightness + shadow (200ms ease-out)
// - Play button overlay on row hover
// - Now-playing indicator with staggered bar animation
// - Error fallback with Film icon
// =============================================================================

interface ThumbnailCellProps {
    /** YouTube video ID (used for fallback thumbnail URL) */
    videoId?: string;
    /** Direct thumbnail URL (preferred over videoId fallback) */
    thumbnailUrl?: string;
    /** Callback when play button is clicked */
    onPlay?: () => void;
    /** Whether this video is currently playing */
    isPlaying?: boolean;
    /** Additional className for the container */
    className?: string;
}

export const ThumbnailCell = memo<ThumbnailCellProps>(({
    videoId,
    thumbnailUrl,
    onPlay,
    isPlaying = false,
    className = '',
}) => {
    const [isLoaded, setIsLoaded] = useState(false);
    const [isError, setIsError] = useState(false);

    const src = thumbnailUrl || (videoId ? `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg` : undefined);

    if (!src) {
        return (
            <div
                className={`w-full rounded-md bg-text-primary/5 transition-all duration-200 ease-out group-hover:bg-text-primary/10 group-hover:shadow-lg ${className}`}
                style={{ aspectRatio: '16/9' }}
            />
        );
    }

    return (
        <div className={`flex items-center justify-center py-1.5 ${className}`}>
            <div
                className={`relative w-full overflow-hidden rounded-md ${isPlaying ? 'ring-1 ring-emerald-400/60' : ''}`}
                style={{ aspectRatio: '16/9' }}
            >
                {/* Pulse placeholder — removed after load to stop CSS animation */}
                {!isError && !isLoaded && (
                    <div className="absolute inset-0 bg-text-primary/5 animate-pulse rounded-md" />
                )}

                {isError ? (
                    <div className="absolute inset-0 flex items-center justify-center bg-text-primary/5 rounded-md">
                        <Film size={16} className="text-text-primary/20" />
                    </div>
                ) : (
                    <img
                        src={src}
                        alt=""
                        loading="lazy"
                        onLoad={() => setIsLoaded(true)}
                        onError={() => setIsError(true)}
                        className={`absolute inset-0 w-full h-full object-cover group-hover:scale-105 group-hover:brightness-110 group-hover:shadow-lg ${
                            isLoaded ? 'opacity-100' : 'opacity-0'
                        }`}
                        style={{
                            transition: 'opacity 500ms ease-out, transform 200ms ease-out, filter 200ms ease-out, box-shadow 200ms ease-out',
                        }}
                    />
                )}

                {/* Play button overlay — visible on row hover, hidden when playing */}
                {!isPlaying && onPlay && (
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            onPlay();
                        }}
                        className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200 cursor-pointer bg-transparent border-none z-raised"
                    >
                        <div className="w-6 h-6 rounded-full bg-black/60 backdrop-blur-sm flex items-center justify-center shadow-lg transition-transform duration-150 ease-out hover:scale-110">
                            <Play size={12} className="text-white fill-white ml-[1px]" />
                        </div>
                    </button>
                )}

                {/* Now Playing indicator — staggered bar animation */}
                {isPlaying && (
                    <div className="absolute bottom-0.5 left-0.5 flex items-center gap-1 px-1 py-px rounded bg-emerald-500/80 z-raised">
                        <div className="flex items-end gap-px h-[8px]">
                            <span className="w-[2px] bg-white rounded-full animate-[barBounce_0.8s_ease-in-out_infinite]" style={{ height: '4px' }} />
                            <span className="w-[2px] bg-white rounded-full animate-[barBounce_0.8s_ease-in-out_0.2s_infinite]" style={{ height: '7px' }} />
                            <span className="w-[2px] bg-white rounded-full animate-[barBounce_0.8s_ease-in-out_0.4s_infinite]" style={{ height: '5px' }} />
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
});

ThumbnailCell.displayName = 'ThumbnailCell';
