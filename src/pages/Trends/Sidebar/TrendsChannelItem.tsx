import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Eye, EyeOff, MoreVertical, ChevronDown, ChevronRight } from 'lucide-react';
import type { TrendChannel, TrendNiche } from '../../../core/types/trends';
import { CollapsibleNicheList } from './CollapsibleNicheList';
import { useTrendStore } from '../../../core/stores/trendStore';

interface TrendsChannelItemProps {
    channel: TrendChannel;
    isActive: boolean;
    onChannelClick: (id: string) => void;
    onToggleVisibility: (e: React.MouseEvent, id: string, isVisible: boolean) => void;
    onOpenMenu: (e: React.MouseEvent, channelId: string) => void;
    niches?: TrendNiche[];
    activeNicheIds?: string[];
    onNicheClick?: (id: string, channelId?: string) => void;
    trashCount?: number;
    viewCount?: number;
    isMenuOpen?: boolean;
}

const formatViewCount = (num?: number) => {
    if (!num) return '0';
    return new Intl.NumberFormat('en-US', {
        notation: "compact",
        maximumFractionDigits: 1
    }).format(num);
};

// LocalStorage key prefix for channel collapse state
const CHANNEL_EXPANDED_KEY = 'trends-channel-expanded-';

export const TrendsChannelItem: React.FC<TrendsChannelItemProps> = ({
    channel,
    isActive,
    onChannelClick,
    onToggleVisibility,
    onOpenMenu,
    niches = [],
    activeNicheIds = [],
    onNicheClick,
    trashCount = 0,
    viewCount = 0,
    isMenuOpen = false
}) => {
    // Persist channel niche section collapse state per-channel
    const [isExpanded, setIsExpanded] = useState(() => {
        const saved = localStorage.getItem(CHANNEL_EXPANDED_KEY + channel.id);
        return saved !== null ? saved === 'true' : true; // Default expanded
    });
    useEffect(() => {
        localStorage.setItem(CHANNEL_EXPANDED_KEY + channel.id, String(isExpanded));
    }, [isExpanded, channel.id]);

    // Track avatar loading errors to show fallback
    const [avatarError, setAvatarError] = useState(false);
    const markAvatarBroken = useTrendStore(state => state.markAvatarBroken);

    // Reset avatar error state when avatarUrl changes
    const [prevAvatarUrl, setPrevAvatarUrl] = useState(channel.avatarUrl);
    if (channel.avatarUrl !== prevAvatarUrl) {
        setPrevAvatarUrl(channel.avatarUrl);
        setAvatarError(false);
    }

    const handleAvatarError = () => {
        setAvatarError(true);
        markAvatarBroken(channel.id);
    };

    // Tooltip State
    const [showTooltip, setShowTooltip] = useState(false);
    const [isHovered, setIsHovered] = useState(false);
    const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const nameRef = useRef<HTMLSpanElement>(null);

    const hasContent = niches.length > 0 || trashCount > 0;

    const handleMouseEnter = () => {
        timerRef.current = setTimeout(() => {
            if (nameRef.current) {
                const rect = nameRef.current.getBoundingClientRect();
                setTooltipPos({ x: rect.left, y: rect.top - 8 });
                setShowTooltip(true);
            }
        }, 500);
    };

    const handleMouseLeave = () => {
        if (timerRef.current) clearTimeout(timerRef.current);
        setShowTooltip(false);
        setIsHovered(false);
    };

    const handleSpanMouseLeave = () => {
        if (timerRef.current) clearTimeout(timerRef.current);
        setShowTooltip(false);
    };

    // Detect text truncation
    const [isTruncated, setIsTruncated] = useState(false);
    useEffect(() => {
        const el = nameRef.current;
        if (!el) return;
        const check = () => setIsTruncated(el.scrollWidth > el.clientWidth);
        check();
        const ro = new ResizeObserver(check);
        ro.observe(el);
        return () => ro.disconnect();
    }, [channel.title]);

    return (
        <React.Fragment>
            <li
                onClick={() => onChannelClick(channel.id)}
                onMouseEnter={() => setIsHovered(true)}
                onMouseLeave={handleMouseLeave}
                className={`flex items-center group cursor-pointer p-2 rounded-lg transition-all duration-200 select-none ${isActive
                    ? 'bg-white/10'
                    : isMenuOpen ? 'bg-white/5' : 'hover:bg-white/5'
                    }`}
            >
                {channel.avatarUrl && !avatarError ? (
                    <img
                        src={channel.avatarUrl}
                        alt={channel.title}
                        referrerPolicy="no-referrer"
                        onError={handleAvatarError}
                        className={`w-6 h-6 rounded-full mr-3 ring-2 transition-all ${!channel.isVisible ? 'grayscale opacity-50' : ''
                            } ${isActive ? 'ring-white/30' : 'ring-transparent'}`}
                    />
                ) : (
                    <div className={`w-6 h-6 rounded-full mr-3 ring-2 flex items-center justify-center bg-white/10 text-text-secondary text-xs font-medium transition-all ${!channel.isVisible ? 'opacity-50' : ''
                        } ${isActive ? 'ring-white/30' : 'ring-transparent'}`}>
                        {channel.title.charAt(0).toUpperCase()}
                    </div>
                )}

                {/* Expand Toggle */}
                {hasContent && (
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            setIsExpanded(!isExpanded);
                        }}
                        className="p-2 -m-1.5 mr-0 text-text-tertiary hover:text-white transition-colors"
                    >
                        {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                    </button>
                )}

                <span
                    ref={nameRef}
                    onMouseEnter={handleMouseEnter}
                    onMouseLeave={handleSpanMouseLeave}
                    className={`text-sm flex-1 overflow-hidden whitespace-nowrap transition-colors ${isActive ? 'text-text-primary font-medium' : 'text-text-secondary'
                        }`}
                    style={isTruncated ? {
                        maskImage: `linear-gradient(to right, black ${isActive || isHovered ? '60%' : '80%'}, transparent 100%)`,
                        WebkitMaskImage: `linear-gradient(to right, black ${isActive || isHovered ? '60%' : '80%'}, transparent 100%)`
                    } : undefined}>
                    {channel.title}
                </span>

                {/* Portal Tooltip */}
                {showTooltip && createPortal(
                    <div
                        className="fixed z-popover px-2 py-1 bg-[#1a1a1a] border border-white/10 rounded-md shadow-xl text-xs text-white whitespace-nowrap pointer-events-none animate-fade-in"
                        style={{ left: tooltipPos.x, top: tooltipPos.y, transform: 'translateY(-100%)' }}
                    >
                        {channel.title}
                    </div>,
                    document.body
                )}

                {/* View Count & Actions block */}
                {(isActive || isHovered || isMenuOpen || !channel.isVisible) && (
                    <div className={`ml-1 flex items-center gap-0.5 shrink-0 transition-opacity animate-fade-in`}>
                        {(isActive || isHovered) && (
                            <span className={`text-[10px] text-text-tertiary shrink-0 leading-none transition-opacity duration-200`}>
                                {formatViewCount(viewCount)}
                            </span>
                        )}
                        <div className={`flex items-center gap-0.5 ${!channel.isVisible || isMenuOpen ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'} transition-opacity`}>
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onToggleVisibility(e, channel.id, channel.isVisible);
                                }}
                                className={`p-0.5 rounded-full transition-all ${channel.isVisible
                                    ? 'text-text-secondary hover:text-text-primary hover:bg-white/10'
                                    : 'text-text-tertiary bg-white/5 hover:text-red-400 hover:bg-red-500/10'
                                    } relative after:absolute after:-inset-2 after:content-['']`}
                                title={channel.isVisible ? "Hide channel" : "Show channel"}
                            >
                                {channel.isVisible ? <Eye size={14} /> : <EyeOff size={14} />}
                            </button>
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onOpenMenu(e, channel.id);
                                }}
                                className="p-0.5 text-text-secondary hover:text-white hover:bg-white/10 rounded-full transition-colors relative after:absolute after:-inset-2 after:content-['']"
                                title="More options"
                            >
                                <MoreVertical size={14} />
                            </button>
                        </div>
                    </div>
                )}
            </li>
            {isExpanded && hasContent && (
                <li className="mb-1">
                    <CollapsibleNicheList
                        niches={niches}
                        activeNicheIds={activeNicheIds}
                        onNicheClick={(id) => id && onNicheClick?.(id, channel.id)}
                        trashCount={trashCount}
                        storageKey={channel.id}
                    />
                </li>
            )}
        </React.Fragment>
    );
};
