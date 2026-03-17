import { useState, useMemo, useCallback, useRef, useEffect } from 'react'
import { Search, X, Film } from 'lucide-react'
import type { VideoPreviewData } from '../../Video/types'

interface VideoLinkFieldProps {
    /** Currently linked video ID (undefined = not linked) */
    videoId: string | undefined
    /** Full video catalog for search */
    videoCatalog: VideoPreviewData[]
    /** Called when user links/unlinks a video */
    onChange: (videoId: string | undefined) => void
}

const MAX_RESULTS = 8
const MIN_QUERY_LENGTH = 2

/**
 * VideoLinkField — form field for linking/unlinking a KI to a video.
 *
 * Linked state: compact video preview + Unlink button.
 * Unlinked state: search input + filtered dropdown list.
 */
export const VideoLinkField = ({
    videoId,
    videoCatalog,
    onChange,
}: VideoLinkFieldProps) => {
    const [query, setQuery] = useState('')
    const [isDropdownOpen, setIsDropdownOpen] = useState(false)
    const [rawHighlightIndex, setHighlightedIndex] = useState(0)
    const inputRef = useRef<HTMLInputElement>(null)
    const dropdownRef = useRef<HTMLDivElement>(null)

    // Resolve the linked video from catalog
    const linkedVideo = useMemo(() => {
        if (!videoId) return null
        return videoCatalog.find(v => v.videoId === videoId || v.youtubeVideoId === videoId) ?? null
    }, [videoId, videoCatalog])

    // Filter catalog by query
    const filteredVideos = useMemo(() => {
        if (query.length < MIN_QUERY_LENGTH) return []
        const q = query.toLowerCase()
        return videoCatalog
            .filter(v => {
                const titleMatch = v.title.toLowerCase().includes(q)
                const channelMatch = v.channelTitle?.toLowerCase().includes(q)
                const idMatch = v.videoId.toLowerCase().includes(q)
                    || v.youtubeVideoId?.toLowerCase().includes(q)
                return titleMatch || channelMatch || idMatch
            })
            .slice(0, MAX_RESULTS)
    }, [query, videoCatalog])

    // Clamp index to valid range when results change (same pattern as VideoSuggestionList)
    const highlightedIndex = filteredVideos.length > 0
        ? Math.min(rawHighlightIndex, filteredVideos.length - 1)
        : 0

    // Close dropdown on outside click
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (
                dropdownRef.current
                && !dropdownRef.current.contains(e.target as Node)
                && inputRef.current
                && !inputRef.current.contains(e.target as Node)
            ) {
                setIsDropdownOpen(false)
            }
        }
        document.addEventListener('mousedown', handleClickOutside)
        return () => document.removeEventListener('mousedown', handleClickOutside)
    }, [])

    const handleSelect = useCallback((video: VideoPreviewData) => {
        onChange(video.videoId)
        setQuery('')
        setIsDropdownOpen(false)
    }, [onChange])

    const handleUnlink = useCallback(() => {
        onChange(undefined)
        // Focus search input after unlink
        requestAnimationFrame(() => inputRef.current?.focus())
    }, [onChange])

    const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
        if (!isDropdownOpen || filteredVideos.length === 0) return

        if (e.key === 'ArrowDown') {
            e.preventDefault()
            setHighlightedIndex(i => (i + 1) % filteredVideos.length)
        } else if (e.key === 'ArrowUp') {
            e.preventDefault()
            setHighlightedIndex(i => (i + filteredVideos.length - 1) % filteredVideos.length)
        } else if (e.key === 'Enter') {
            e.preventDefault()
            const video = filteredVideos[highlightedIndex]
            if (video) handleSelect(video)
        } else if (e.key === 'Escape') {
            setIsDropdownOpen(false)
        }
    }, [isDropdownOpen, filteredVideos, highlightedIndex, handleSelect])

    return (
        <div>
            <label className="block text-xs text-text-secondary font-medium mb-1.5 uppercase tracking-wider">
                Linked Video
            </label>

            {linkedVideo ? (
                /* ── Linked state: compact preview ── */
                <div className="flex items-center gap-3 bg-input-bg border border-border rounded-lg px-3 py-2 group">
                    {linkedVideo.thumbnailUrl && (
                        <img
                            src={linkedVideo.thumbnailUrl}
                            alt=""
                            className="w-12 aspect-video object-cover rounded flex-shrink-0"
                        />
                    )}
                    <div className="flex-1 min-w-0">
                        <div className="text-sm text-text-primary truncate">{linkedVideo.title}</div>
                        {linkedVideo.channelTitle && (
                            <div className="text-[10px] text-text-tertiary truncate">{linkedVideo.channelTitle}</div>
                        )}
                    </div>
                    {linkedVideo.ownership === 'competitor' && (
                        <span className="text-[9px] text-text-tertiary bg-white/[0.06] px-1.5 py-0.5 rounded-full flex-shrink-0">
                            Competitor
                        </span>
                    )}
                    <button
                        type="button"
                        onClick={handleUnlink}
                        className="p-1 rounded-md text-text-tertiary hover:text-text-primary hover:bg-hover-bg transition-colors cursor-pointer bg-transparent border-none opacity-0 group-hover:opacity-100"
                        title="Unlink video"
                    >
                        <X size={14} />
                    </button>
                </div>
            ) : (
                /* ── Unlinked state: search input + dropdown ── */
                <div className="relative">
                    <div className="relative">
                        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary pointer-events-none" />
                        <input
                            ref={inputRef}
                            type="text"
                            value={query}
                            onChange={(e) => {
                                setQuery(e.target.value)
                                setIsDropdownOpen(e.target.value.length >= MIN_QUERY_LENGTH)
                            }}
                            onFocus={() => {
                                if (query.length >= MIN_QUERY_LENGTH) setIsDropdownOpen(true)
                            }}
                            onKeyDown={handleKeyDown}
                            className="w-full bg-input-bg border border-border rounded-lg pl-8 pr-3 py-2 text-sm text-text-primary placeholder-text-tertiary outline-none hover:border-text-primary focus:border-text-primary transition-colors"
                            placeholder="Search videos to link..."
                        />
                    </div>

                    {isDropdownOpen && filteredVideos.length > 0 && (
                        <div
                            ref={dropdownRef}
                            className="absolute z-dropdown left-0 right-0 mt-1 bg-bg-secondary border border-border rounded-xl shadow-2xl overflow-y-auto overscroll-contain max-h-[280px] py-1"
                        >
                            {filteredVideos.map((video, index) => (
                                <button
                                    key={video.videoId}
                                    type="button"
                                    className={`w-full flex items-center gap-2.5 px-3 py-1.5 text-left cursor-pointer border-none bg-transparent ${
                                        index === highlightedIndex ? 'bg-white/[0.08]' : 'hover:bg-white/[0.04]'
                                    }`}
                                    onClick={() => handleSelect(video)}
                                    onMouseEnter={() => setHighlightedIndex(index)}
                                >
                                    {video.thumbnailUrl && (
                                        <img
                                            src={video.thumbnailUrl}
                                            alt=""
                                            className="w-12 aspect-video object-cover rounded flex-shrink-0"
                                        />
                                    )}
                                    <div className="flex-1 min-w-0">
                                        <div className="text-xs text-text-primary truncate">{video.title}</div>
                                        {video.channelTitle && (
                                            <div className="text-[10px] text-text-tertiary truncate">{video.channelTitle}</div>
                                        )}
                                    </div>
                                    {video.ownership === 'competitor' && (
                                        <span className="text-[9px] text-text-tertiary bg-white/[0.06] px-1.5 py-0.5 rounded-full flex-shrink-0">
                                            Competitor
                                        </span>
                                    )}
                                </button>
                            ))}
                        </div>
                    )}

                    {isDropdownOpen && query.length >= MIN_QUERY_LENGTH && filteredVideos.length === 0 && (
                        <div className="absolute z-dropdown left-0 right-0 mt-1 bg-bg-secondary border border-border rounded-xl shadow-2xl py-4 px-3 text-center">
                            <Film size={16} className="mx-auto mb-1 text-text-tertiary" />
                            <div className="text-xs text-text-tertiary">No videos found</div>
                        </div>
                    )}
                </div>
            )}

        </div>
    )
}
