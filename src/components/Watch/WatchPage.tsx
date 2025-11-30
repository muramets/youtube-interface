import React, { useEffect, useState, useMemo } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { useVideosStore } from '../../stores/videosStore';
import { useFilterStore } from '../../stores/filterStore';
import { usePlaylistsStore } from '../../stores/playlistsStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { useAuthStore } from '../../stores/authStore';
import { useChannelStore } from '../../stores/channelStore';
import { FilterType, SortOption } from '../../constants/enums';
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
import { WatchPageSkeleton } from './WatchPageSkeleton';
import { WatchPageVideoPlayer } from './WatchPageVideoPlayer';
import { WatchPageVideoInfo } from './WatchPageVideoInfo';
import { WatchPageNotes } from './WatchPageNotes';

export const WatchPage: React.FC = () => {
    const { id } = useParams<{ id: string }>();
    const [searchParams] = useSearchParams();
    const playlistId = searchParams.get('list');
    const { videos, isLoading } = useVideosStore();
    const { searchQuery } = useFilterStore();
    const { playlists } = usePlaylistsStore();
    const {
        generalSettings,
        recommendationOrders,
        updateRecommendationOrders,
        videoOrder
    } = useSettingsStore();
    const { user } = useAuthStore();
    const { currentChannel } = useChannelStore();

    const hiddenPlaylistIds = useMemo(() => generalSettings.hiddenPlaylistIds || [], [generalSettings.hiddenPlaylistIds]);

    // Filter states
    const [selectedFilter, setSelectedFilter] = useState<FilterType>(FilterType.ALL);
    const [selectedPlaylistIds, setSelectedPlaylistIds] = useState<string[]>([]);
    const [sortBy, setSortBy] = useState<SortOption>(SortOption.DEFAULT);

    const video = videos.find(v => v.id === id);

    useEffect(() => {
        const mainContainer = document.querySelector('main');
        if (mainContainer) {
            mainContainer.scrollTo(0, 0);
        }
    }, [id]);

    useEffect(() => {
        const timer = setTimeout(() => {
            if (playlistId) {
                setSelectedFilter(FilterType.PLAYLISTS);
                setSelectedPlaylistIds([playlistId]);
            } else {
                setSelectedFilter(FilterType.ALL);
                setSelectedPlaylistIds([]);
            }
        }, 0);
        return () => clearTimeout(timer);
    }, [playlistId]);

    // --- Filtering Logic ---
    const containingPlaylists = useMemo(() => {
        if (!video) return [];
        return playlists.filter(playlist => playlist.videoIds.includes(video.id));
    }, [playlists, video]);

    const filterKey = useMemo(() => {
        if (selectedFilter === FilterType.ALL) return 'all';
        if (selectedFilter === FilterType.CHANNEL) return 'channel';
        if (selectedFilter === FilterType.PLAYLISTS) {
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

        if (selectedFilter === FilterType.CHANNEL) {
            recs = recs.filter(v => v.channelTitle === video.channelTitle);
        } else if (selectedFilter === FilterType.PLAYLISTS) {
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
            if (sortBy === SortOption.VIEWS) {
                recs = [...recs].sort((a, b) => {
                    const viewsA = parseInt(a.viewCount?.replace(/[^0-9]/g, '') || '0', 10);
                    const viewsB = parseInt(b.viewCount?.replace(/[^0-9]/g, '') || '0', 10);
                    return viewsB - viewsA;
                });
            } else if (sortBy === SortOption.DATE) {
                recs = [...recs].sort((a, b) => {
                    const dateA = new Date(a.publishedAt).getTime();
                    const dateB = new Date(b.publishedAt).getTime();
                    return dateB - dateA;
                });
            } else {
                // Default: Use Home Page Order
                if (videoOrder && videoOrder.length > 0) {
                    const orderMap = new Map(videoOrder.map((id, index) => [id, index]));
                    recs = [...recs].sort((a, b) => {
                        const indexA = orderMap.get(a.id);
                        const indexB = orderMap.get(b.id);

                        if (indexA !== undefined && indexB !== undefined) return indexA - indexB;
                        if (indexA !== undefined) return -1;
                        if (indexB !== undefined) return 1;
                        return 0;
                    });
                }
            }
        }

        return recs;
    }, [videos, video, selectedFilter, selectedPlaylistIds, playlists, searchQuery, sortBy, hiddenPlaylistIds, recommendationOrders, filterKey, videoOrder]);


    const handleFilterChange = (filter: FilterType) => {
        setSelectedFilter(filter);
        if (filter !== FilterType.PLAYLISTS) {
            setSelectedPlaylistIds([]);
        }
    };

    const handlePlaylistToggle = (pId: string) => {
        if (selectedFilter !== FilterType.PLAYLISTS) {
            setSelectedFilter(FilterType.PLAYLISTS);
            setSelectedPlaylistIds([pId]);
        } else {
            setSelectedPlaylistIds(prev => {
                if (prev.includes(pId)) {
                    const next = prev.filter(id => id !== pId);
                    if (next.length === 0) {
                        setSelectedFilter(FilterType.ALL);
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
                if (user && currentChannel) {
                    updateRecommendationOrders(user.uid, currentChannel.id, newOrders);
                }
            }
        }
    };

    const isDraggable = true; // Always draggable now that we have custom order

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
                <WatchPageVideoPlayer video={video} />
                <WatchPageVideoInfo video={video} />
                <WatchPageNotes video={video} />
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
                        if (user && currentChannel) {
                            updateRecommendationOrders(user.uid, currentChannel.id, newOrders);
                        }
                    }}
                    revertTooltip={selectedFilter === FilterType.PLAYLISTS ? "Restore order from playlist" : "Restore order from current home page"}
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
                                        playlistId={playlistId || (selectedFilter === FilterType.PLAYLISTS && selectedPlaylistIds.length === 1 ? selectedPlaylistIds[0] : undefined)}
                                    />
                                ))}
                            </SortableContext>
                        </DndContext>
                    ) : (
                        recommendedVideos.map(video => (
                            <SortableRecommendationCard
                                key={video.id}
                                video={video}
                                playlistId={playlistId || (selectedFilter === FilterType.PLAYLISTS && selectedPlaylistIds.length === 1 ? selectedPlaylistIds[0] : undefined)}
                            />
                        ))
                    )}
                </div>
            </div>
        </div>

    );
};

