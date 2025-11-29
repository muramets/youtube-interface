import React, { useEffect, useState, useMemo } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { useVideos } from '../../context/VideosContext';
import { useVideoFiltering } from '../../context/VideoFilterContext';
import { useVideoActions } from '../../context/VideoActionsContext';
import { usePlaylists } from '../../context/PlaylistsContext';
import { useSettings } from '../../context/SettingsContext';
import { useChannel } from '../../context/ChannelContext';
import { ThumbsUp, ThumbsDown, Share2, MoreHorizontal, User, Trash2, Send } from 'lucide-react';
import { formatViewCount } from '../../utils/formatUtils';
import type { VideoNote } from '../../utils/youtubeApi';
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
import { Toast } from '../Shared/Toast';
import { WatchPageSkeleton } from './WatchPageSkeleton';

export const WatchPage: React.FC = () => {
    const { id } = useParams<{ id: string }>();
    const [searchParams] = useSearchParams();
    const playlistId = searchParams.get('list');
    const { videos, isLoading } = useVideos();
    const { updateVideo } = useVideoActions();
    const { searchQuery } = useVideoFiltering();
    const { playlists } = usePlaylists();
    const {
        generalSettings,
        recommendationOrders,
        updateRecommendationOrders
    } = useSettings();

    const hiddenPlaylistIds = generalSettings.hiddenPlaylistIds || [];
    const { currentChannel } = useChannel();
    const [isDescriptionExpanded, setIsDescriptionExpanded] = useState(false);
    const [toastMessage, setToastMessage] = useState('');
    const [showToast, setShowToast] = useState(false);

    // Filter states
    const [selectedFilter, setSelectedFilter] = useState<'all' | 'channel' | 'playlists'>('all');
    const [selectedPlaylistIds, setSelectedPlaylistIds] = useState<string[]>([]);
    const [sortBy, setSortBy] = useState<'default' | 'views' | 'date'>('default');
    const [noteText, setNoteText] = useState('');


    const video = videos.find(v => v.id === id);

    // ... (notes logic) ...

    const handleAddNote = async () => {
        if (!video || !noteText.trim()) return;

        const newNote: VideoNote = {
            id: Date.now().toString(),
            text: noteText.trim(),
            timestamp: Date.now(),
            userId: currentChannel?.id
        };

        const updatedNotes = [...(video.notes || []), newNote];
        await updateVideo(video.id, { notes: updatedNotes });
        setNoteText('');
    };

    const handleDeleteNote = async (noteId: string) => {
        if (!video || !video.notes) return;
        const updatedNotes = video.notes.filter(n => n.id !== noteId);
        await updateVideo(video.id, { notes: updatedNotes });
    };

    useEffect(() => {
        const mainContainer = document.querySelector('main');
        if (mainContainer) {
            mainContainer.scrollTo(0, 0);
        }
    }, [id]);

    useEffect(() => {
        if (playlistId) {
            setSelectedFilter('playlists');
            setSelectedPlaylistIds([playlistId]);
        } else {
            setSelectedFilter('all');
            setSelectedPlaylistIds([]);
        }
    }, [playlistId]);

    // --- Filtering Logic ---
    const containingPlaylists = useMemo(() => {
        if (!video) return [];
        return playlists.filter(playlist => playlist.videoIds.includes(video.id));
    }, [playlists, video]);

    const filterKey = useMemo(() => {
        if (selectedFilter === 'all') return 'all';
        if (selectedFilter === 'channel') return 'channel';
        if (selectedFilter === 'playlists') {
            return `playlist_${[...selectedPlaylistIds].sort().join('_')}`;
        }
        return 'all';
    }, [selectedFilter, selectedPlaylistIds]);

    const hasCustomOrder = useMemo(() => {
        if (!video) return false;
        const key = `${video.id}_${filterKey}`;
        return !!recommendationOrders[key];
    }, [recommendationOrders, video, filterKey]);

    // Calculate recommended videos
    const recommendedVideos = useMemo(() => {
        if (!video) return [];

        let recs = videos.filter(v => v.id !== video.id);

        // Filter out hidden playlists
        if (hiddenPlaylistIds.length > 0) {
            const hiddenVideoIds = new Set<string>();
            playlists.forEach(playlist => {
                if (hiddenPlaylistIds.includes(playlist.id)) {
                    playlist.videoIds.forEach(id => hiddenVideoIds.add(id));
                }
            });
            recs = recs.filter(v => !hiddenVideoIds.has(v.id));
        }

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

        // Apply Custom Order or Sort
        const customOrder = recommendationOrders[`${video.id}_${filterKey}`];

        if (customOrder && customOrder.length > 0) {
            const orderMap = new Map(customOrder.map((id, index) => [id, index]));
            recs = [...recs].sort((a, b) => {
                const indexA = orderMap.get(a.id);
                const indexB = orderMap.get(b.id);

                if (indexA !== undefined && indexB !== undefined) return indexA - indexB;
                if (indexA !== undefined) return -1;
                if (indexB !== undefined) return 1;
                return 0;
            });
        } else {
            // Standard Sorting
            if (sortBy === 'views') {
                recs = [...recs].sort((a, b) => {
                    const viewsA = parseInt(a.viewCount?.replace(/[^0-9]/g, '') || '0', 10);
                    const viewsB = parseInt(b.viewCount?.replace(/[^0-9]/g, '') || '0', 10);
                    return viewsB - viewsA;
                });
            } else if (sortBy === 'date') {
                recs = [...recs].sort((a, b) => {
                    const dateA = new Date(a.publishedAt).getTime();
                    const dateB = new Date(b.publishedAt).getTime();
                    return dateB - dateA;
                });
            }
        }

        return recs;
    }, [videos, video, selectedFilter, selectedPlaylistIds, playlists, searchQuery, sortBy, hiddenPlaylistIds, recommendationOrders, filterKey]);


    const handleFilterChange = (filter: 'all' | 'channel') => {
        setSelectedFilter(filter);
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
                        setSelectedFilter('all');
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
        if (!video) return;
        const { active, over } = event;

        if (over && active.id !== over.id) {
            const oldIndex = recommendedVideos.findIndex((v) => v.id === active.id);
            const newIndex = recommendedVideos.findIndex((v) => v.id === over.id);

            if (oldIndex !== -1 && newIndex !== -1) {
                // We need arrayMove here. It's usually exported from @dnd-kit/sortable
                const newOrderIds = [...recommendedVideos.map(v => v.id)];
                const [movedItem] = newOrderIds.splice(oldIndex, 1);
                newOrderIds.splice(newIndex, 0, movedItem);

                const newOrders = { ...recommendationOrders };
                newOrders[`${video.id}_${filterKey}`] = newOrderIds;
                updateRecommendationOrders(newOrders);
            }
        }
    };

    const isDraggable = true; // Always draggable now that we have custom order
    const description = video?.description || '';

    if (isLoading) {
        return <WatchPageSkeleton />;
    }

    if (!video) {
        return <div className="p-8 text-text-primary">Video not found</div>;
    }

    return (
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_400px] gap-6 py-6 pr-6 pl-0 w-full max-w-[1800px] mx-auto min-h-screen box-border items-start">
            {/* ... (Main Content) ... */}
            <div className="min-w-0">
                {/* ... (Video Player, Title, Actions, Description, Notes) ... */}
                {/* Video Player Container */}
                <div className="w-full aspect-video bg-black rounded-xl overflow-hidden shadow-lg mb-4 relative group">
                    {video.isCustom ? (
                        <div className="w-full h-full relative group cursor-default">
                            <img
                                src={video.customImage || video.thumbnail}
                                alt={video.title}
                                className="w-full h-full object-cover"
                            />
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

                <h1 className="text-xl font-bold text-text-primary mb-3 line-clamp-2">
                    {video.title}
                </h1>

                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                    <div className="flex items-center gap-3">
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
                                {(video.isCustom && currentChannel) ? (
                                    currentChannel.name
                                ) : video.channelId ? (
                                    <a
                                        href={`https://www.youtube.com/channel/${video.channelId}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-inherit no-underline hover:text-blue-500 transition-colors"
                                    >
                                        {video.channelTitle}
                                    </a>
                                ) : (
                                    video.channelTitle
                                )}
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

                <div
                    className="bg-bg-secondary rounded-xl p-3 text-sm text-text-primary cursor-pointer hover:bg-hover-bg transition-colors mb-2"
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

                {video.tags && video.tags.length > 0 && (
                    <div className="flex flex-wrap gap-2 mb-6 px-1">
                        {video.tags.map((tag, index) => (
                            <button
                                key={index}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    navigator.clipboard.writeText(tag);
                                    setToastMessage(`Tag #${tag.replace(/\s+/g, '')} copied to clipboard`);
                                    setShowToast(true);
                                }}
                                className="text-blue-500 text-xs font-medium cursor-pointer hover:underline bg-transparent border-none p-0"
                                title="Click to copy"
                            >
                                #{tag.replace(/\s+/g, '')}
                            </button>
                        ))}
                    </div>
                )}

                <div className="mt-6">
                    <div className="flex items-center justify-between mb-6">
                        <h3 className="text-xl font-bold text-text-primary m-0">My Notes</h3>
                        <span className="text-xs text-text-secondary bg-bg-secondary px-2 py-1 rounded-md">
                            Private • Visible only to you
                        </span>
                    </div>

                    <div className="flex gap-4 mb-8">
                        <div className="w-10 h-10 rounded-full bg-bg-secondary flex-shrink-0 overflow-hidden">
                            {currentChannel?.avatar ? (
                                <img src={currentChannel.avatar} alt="User" className="w-full h-full object-cover" />
                            ) : (
                                <div className="w-full h-full flex items-center justify-center bg-purple-600 text-white font-bold">
                                    {currentChannel?.name?.[0]?.toUpperCase() || 'U'}
                                </div>
                            )}
                        </div>
                        <div className="flex-1">
                            <div className="relative group">
                                <input
                                    type="text"
                                    value={noteText}
                                    onChange={(e) => setNoteText(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter' && !e.shiftKey) {
                                            e.preventDefault();
                                            handleAddNote();
                                        }
                                    }}
                                    placeholder="Add a private note..."
                                    className="w-full bg-transparent border-0 border-b border-border focus:border-b-2 focus:border-text-primary py-2 pr-10 text-text-primary outline-none placeholder:text-text-secondary transition-all"
                                />
                                <button
                                    onClick={handleAddNote}
                                    disabled={!noteText.trim()}
                                    className="absolute right-0 top-1/2 -translate-y-1/2 bg-transparent border-none text-text-primary cursor-pointer disabled:opacity-30 hover:text-blue-500 transition-colors p-2 flex items-center justify-center"
                                >
                                    <Send size={18} />
                                </button>
                            </div>
                        </div>
                    </div>

                    <div className="flex flex-col gap-6">
                        {(!video.notes || video.notes.length === 0) ? (
                            <div className="text-center text-text-secondary py-8 italic text-sm">
                                No notes yet. Write something to remember!
                            </div>
                        ) : (
                            [...(video.notes)].sort((a, b) => b.timestamp - a.timestamp).map((note) => (
                                <div key={note.id} className="flex gap-4 group animate-fade-in items-start">
                                    <div className="w-10 h-10 rounded-full bg-bg-secondary flex-shrink-0 overflow-hidden mt-1">
                                        {currentChannel?.avatar ? (
                                            <img src={currentChannel.avatar} alt="User" className="w-full h-full object-cover" />
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center bg-purple-600 text-white font-bold">
                                                {currentChannel?.name?.[0]?.toUpperCase() || 'U'}
                                            </div>
                                        )}
                                    </div>
                                    <div className="flex-1 pt-1">
                                        <div className="flex gap-2 items-center mb-1">
                                            <span className="font-bold text-xs text-text-primary">
                                                {currentChannel?.name || 'You'}
                                            </span>
                                            <span className="text-xs text-text-secondary">
                                                {new Date(note.timestamp).toLocaleDateString()} • {new Date(note.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                            </span>
                                        </div>
                                        <div className="text-sm text-text-primary whitespace-pre-wrap">
                                            {note.text}
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => handleDeleteNote(note.id)}
                                        className="opacity-0 group-hover:opacity-100 transition-opacity bg-transparent border-none text-text-secondary hover:text-red-500 cursor-pointer p-2 mt-1"
                                        title="Delete note"
                                    >
                                        <Trash2 size={16} />
                                    </button>
                                </div>
                            ))
                        )}
                    </div>
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
                    sortBy={sortBy}
                    onSortChange={(val) => setSortBy(val)}
                    hasCustomOrder={hasCustomOrder}
                    onRevert={() => {
                        const newOrders = { ...recommendationOrders };
                        delete newOrders[`${video.id}_${filterKey}`];
                        updateRecommendationOrders(newOrders);
                    }}
                    revertTooltip={selectedFilter === 'playlists' ? "Restore order from playlist" : "Restore order from current home page"}
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
                                        playlistId={playlistId || (selectedFilter === 'playlists' && selectedPlaylistIds.length === 1 ? selectedPlaylistIds[0] : undefined)}
                                    />
                                ))}
                            </SortableContext>
                        </DndContext>
                    ) : (
                        recommendedVideos.map(video => (
                            <SortableRecommendationCard
                                key={video.id}
                                video={video}
                                playlistId={playlistId || (selectedFilter === 'playlists' && selectedPlaylistIds.length === 1 ? selectedPlaylistIds[0] : undefined)}
                            />
                        ))
                    )}
                </div>
            </div>
            <Toast
                message={toastMessage}
                isVisible={showToast}
                onClose={() => setShowToast(false)}
            />
        </div>
    );
};
