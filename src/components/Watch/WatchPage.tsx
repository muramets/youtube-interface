import React, { useEffect, useState, useMemo } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { useVideo } from '../../context/VideoContext';
import { useChannel } from '../../context/ChannelContext';
import { ThumbsUp, ThumbsDown, Share2, MoreHorizontal, User } from 'lucide-react';
import { formatViewCount } from '../../utils/formatUtils';
import {
    DndContext,
    closestCenter,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
    type DragEndEvent
} from '@dnd-kit/core';
import {
    SortableContext,
    sortableKeyboardCoordinates,
    verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { SortableRecommendationCard } from './SortableRecommendationCard';
import { WatchPageFilterBar } from './WatchPageFilterBar';

export const WatchPage: React.FC = () => {
    const { id } = useParams<{ id: string }>();
    const [searchParams] = useSearchParams();
    const playlistId = searchParams.get('list');
    const { videos, playlists, moveVideo, searchQuery } = useVideo();
    const { currentChannel } = useChannel();
    const [isDescriptionExpanded, setIsDescriptionExpanded] = useState(false);

    // Filter states
    const [selectedFilter, setSelectedFilter] = useState<'all' | 'channel' | 'playlists'>('all');
    const [selectedPlaylistIds, setSelectedPlaylistIds] = useState<string[]>([]);

    const video = videos.find(v => v.id === id);

    useEffect(() => {
        // Scroll the main container to top, not window
        const mainContainer = document.querySelector('main');
        if (mainContainer) {
            mainContainer.scrollTo(0, 0);
        }
    }, [id]);

    // Initialize filter when playlistId is present
    useEffect(() => {
        if (playlistId) {
            setSelectedFilter('playlists');
            setSelectedPlaylistIds([playlistId]);
        } else {
            setSelectedFilter('all');
            setSelectedPlaylistIds([]);
        }
    }, [playlistId]);

    if (!video) {
        return <div className="p-8 text-text-primary">Video not found</div>;
    }

    // --- Filtering Logic ---
    const containingPlaylists = useMemo(() => playlists.filter(playlist =>
        playlist.videoIds.includes(video.id)
    ), [playlists, video.id]);

    // Calculate recommended videos
    const recommendedVideos = useMemo(() => {
        let recs = videos.filter(v => v.id !== video.id);

        if (selectedFilter === 'channel') {
            recs = recs.filter(v => v.channelTitle === video.channelTitle);
        } else if (selectedFilter === 'playlists') {
            if (selectedPlaylistIds.length > 0) {
                const videoIdsInSelectedPlaylists = new Set<string>();
                playlists.forEach(playlist => {
                    if (selectedPlaylistIds.includes(playlist.id)) {
                        playlist.videoIds.forEach(vidId => videoIdsInSelectedPlaylists.add(vidId));
                    }
                });
                recs = recs.filter(v => videoIdsInSelectedPlaylists.has(v.id));
            }
        }

        // Filter by search query
        if (searchQuery) {
            recs = recs.filter(v => v.title.toLowerCase().includes(searchQuery.toLowerCase()));
        }

        return recs;
    }, [videos, video.id, video.channelTitle, selectedFilter, selectedPlaylistIds, playlists, searchQuery]);


    const handleFilterChange = (filter: 'all' | 'channel') => {
        setSelectedFilter(filter);
        // If switching away from playlists, clear selected playlists
        if (filter !== 'playlists' as any) {
            setSelectedPlaylistIds([]);
        }
    };

    const handlePlaylistToggle = (pId: string) => {
        if (selectedFilter !== 'playlists') {
            setSelectedFilter('playlists');
            setSelectedPlaylistIds([pId]);
        } else {
            setSelectedPlaylistIds(prev => {
                if (prev.includes(pId)) {
                    const next = prev.filter(id => id !== pId);
                    if (next.length === 0) {
                        setSelectedFilter('all'); // Revert to all if no playlists selected
                        return [];
                    }
                    return next;
                } else {
                    return [...prev, pId];
                }
            });
        }
    };

    // --- Drag and Drop Logic ---
    const sensors = useSensors(
        useSensor(PointerSensor, {
            activationConstraint: {
                distance: 8,
            },
        }),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        })
    );

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;

        if (over && active.id !== over.id) {
            const oldIndex = videos.findIndex((v) => v.id === active.id);
            const newIndex = videos.findIndex((v) => v.id === over.id);

            if (oldIndex !== -1 && newIndex !== -1) {
                moveVideo(oldIndex, newIndex);
            }
        }
    };

    const isDraggable = selectedFilter === 'all';
    const description = video.description || '';

    return (
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_400px] gap-6 p-6 w-full max-w-[2200px] min-h-screen box-border">
            {/* Main Content (Video Player + Info) */}
            <div className="min-w-0">
                {/* Video Player Container */}
                <div className="w-full aspect-video bg-black rounded-xl overflow-hidden shadow-lg mb-4 relative group">
                    {video.isCustom ? (
                        <div className="w-full h-full relative group cursor-default">
                            <img
                                src={video.customImage || video.thumbnail}
                                alt={video.title}
                                className="w-full h-full object-cover"
                            />
                            {/* Hover Overlay */}
                            <div className="absolute inset-0 bg-black/10 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />
                        </div>
                    ) : (
                        <iframe
                            width="100%"
                            height="100%"
                            src={`https://www.youtube.com/embed/${video.id}`}
                            title={video.title}
                            frameBorder="0"
                            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                            allowFullScreen
                            className="w-full h-full"
                        ></iframe>
                    )}
                </div>

                {/* Video Title */}
                <h1 className="text-xl font-bold text-text-primary mb-3 line-clamp-2">
                    {video.title}
                </h1>

                {/* Video Actions & Channel Info */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                    <div className="flex items-center gap-3">
                        {/* Channel Avatar */}
                        <div className="w-10 h-10 rounded-full overflow-hidden bg-bg-secondary flex-shrink-0">
                            {(video.isCustom && currentChannel?.avatar) ? (
                                <img src={currentChannel.avatar} alt={video.channelTitle} className="w-full h-full object-cover" />
                            ) : video.channelAvatar ? (
                                <img src={video.channelAvatar} alt={video.channelTitle} className="w-full h-full object-cover" />
                            ) : (
                                <div className="w-full h-full bg-bg-secondary flex items-center justify-center">
                                    <User size={20} className="text-text-secondary" />
                                </div>
                            )}
                        </div>
                        <div className="flex flex-col gap-0.5">
                            <span className="font-bold text-text-primary text-base">
                                {(video.isCustom && currentChannel) ? currentChannel.name : video.channelTitle}
                            </span>
                            <span className="text-xs text-text-secondary">
                                {video.subscriberCount || '1.2M'} subscribers
                            </span>
                        </div>
                        <button className="bg-text-primary text-bg-primary px-4 py-2 rounded-full font-medium text-sm ml-6 hover:opacity-90 transition-opacity cursor-pointer border-none">
                            Subscribe
                        </button>
                    </div>

                    <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide">
                        <div className="flex items-center bg-bg-secondary rounded-full overflow-hidden h-9">
                            <button className="flex items-center gap-1.5 px-4 h-full hover:bg-hover-bg cursor-pointer border-none bg-transparent text-text-primary border-r border-border/50">
                                <ThumbsUp size={18} />
                                <span className="text-sm font-medium">{formatViewCount(video.likeCount || '0')}</span>
                            </button>
                            <button className="flex items-center px-4 h-full hover:bg-hover-bg cursor-pointer border-none bg-transparent text-text-primary">
                                <ThumbsDown size={18} />
                            </button>
                        </div>
                        <button className="flex items-center gap-1.5 px-4 h-9 bg-bg-secondary rounded-full hover:bg-hover-bg cursor-pointer border-none text-text-primary whitespace-nowrap text-sm font-medium">
                            <Share2 size={18} />
                            Share
                        </button>
                        <button className="flex items-center justify-center w-9 h-9 bg-bg-secondary rounded-full hover:bg-hover-bg cursor-pointer border-none text-text-primary flex-shrink-0">
                            <MoreHorizontal size={20} />
                        </button>
                    </div>
                </div>

                {/* Description Box */}
                <div
                    className="bg-bg-secondary rounded-xl p-3 text-sm text-text-primary cursor-pointer hover:bg-hover-bg transition-colors mb-6"
                    onClick={() => setIsDescriptionExpanded(!isDescriptionExpanded)}
                >
                    <div className="font-bold mb-2">
                        {formatViewCount(video.viewCount)} views • {new Date(video.publishedAt).toLocaleDateString()}
                    </div>
                    <div className="whitespace-pre-wrap leading-relaxed">
                        {isDescriptionExpanded
                            ? description
                            : description.slice(0, 150) + (description.length > 150 ? '...' : '')}
                    </div>
                    <button className="bg-transparent border-none text-text-primary font-bold mt-1 cursor-pointer p-0">
                        {isDescriptionExpanded ? 'Show less' : '...more'}
                    </button>
                </div>

                {/* Comments Placeholder */}
                <div className="mt-6">
                    <h3 className="text-xl font-bold text-text-primary mb-6">Comments</h3>

                    {/* Add Comment Input */}
                    <div className="flex gap-4 mb-8">
                        <div className="w-10 h-10 rounded-full bg-bg-secondary flex-shrink-0 overflow-hidden">
                            {/* User Avatar Placeholder */}
                            {currentChannel?.avatar ? (
                                <img src={currentChannel.avatar} alt="User" className="w-full h-full object-cover" />
                            ) : (
                                <div className="w-full h-full flex items-center justify-center bg-purple-600 text-white font-bold">
                                    {currentChannel?.name?.[0]?.toUpperCase() || 'U'}
                                </div>
                            )}
                        </div>
                        <div className="flex-1">
                            <input
                                type="text"
                                placeholder="Add a comment..."
                                className="w-full bg-transparent border-none border-b border-border py-2 text-text-primary outline-none focus:border-text-primary transition-colors"
                            />
                        </div>
                    </div>

                    {/* Dummy Comments */}
                    {[1, 2, 3].map((i) => (
                        <div key={i} className="flex gap-4 mb-6">
                            <div className="w-10 h-10 rounded-full bg-bg-secondary flex-shrink-0"></div>
                            <div>
                                <div className="flex gap-2 items-center mb-1">
                                    <span className="font-bold text-xs text-text-primary">@user{i}</span>
                                    <span className="text-xs text-text-secondary">2 days ago</span>
                                </div>
                                <div className="text-sm text-text-primary mb-2">
                                    This is a placeholder comment to simulate the comments section. It looks just like the real thing!
                                </div>
                                <div className="flex gap-4 items-center">
                                    <button className="bg-transparent border-none text-text-primary cursor-pointer text-xs flex items-center gap-1 hover:bg-hover-bg p-1 rounded-full">
                                        <ThumbsUp size={14} /> 12
                                    </button>
                                    <button className="bg-transparent border-none text-text-primary cursor-pointer text-xs flex items-center hover:bg-hover-bg p-1 rounded-full">
                                        <ThumbsDown size={14} />
                                    </button>
                                    <button className="bg-transparent border-none text-text-primary cursor-pointer text-xs font-medium hover:bg-hover-bg py-1 px-2 rounded-full">Reply</button>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Recommendations Sidebar */}
            <div className="w-full lg:w-auto flex-shrink-0">
                <WatchPageFilterBar
                    channelName={video.channelTitle}
                    selectedFilter={selectedFilter}
                    selectedPlaylistIds={selectedPlaylistIds}
                    containingPlaylists={containingPlaylists}
                    onFilterChange={handleFilterChange}
                    onPlaylistToggle={handlePlaylistToggle}
                />

                <div className="flex flex-col gap-2">
                    {isDraggable ? (
                        <DndContext
                            sensors={sensors}
                            collisionDetection={closestCenter}
                            onDragEnd={handleDragEnd}
                        >
                            <SortableContext
                                items={recommendedVideos.map(v => v.id)}
                                strategy={verticalListSortingStrategy}
                            >
                                {recommendedVideos.map(video => (
                                    <SortableRecommendationCard
                                        key={video.id}
                                        video={video}
                                        playlistId={playlistId || undefined}
                                    />
                                ))}
                            </SortableContext>
                        </DndContext>
                    ) : (
                        recommendedVideos.map(video => (
                            <SortableRecommendationCard
                                key={video.id}
                                video={video}
                                playlistId={playlistId || undefined}
                            />
                        ))
                    )}
                </div>
            </div>
        </div>
    );
};
