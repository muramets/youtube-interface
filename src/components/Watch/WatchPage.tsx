import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useLocation } from 'react-router-dom';
import { useVideo } from '../../context/VideoContext';
import { SortableRecommendationCard } from './SortableRecommendationCard';
import { WatchPageFilterBar } from './WatchPageFilterBar';
import type { VideoDetails } from '../../utils/youtubeApi';
import {
    DndContext,
    closestCenter,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
    type DragEndEvent,
} from '@dnd-kit/core';
import {
    SortableContext,
    sortableKeyboardCoordinates,
    rectSortingStrategy,
} from '@dnd-kit/sortable';
import { formatViewCount } from '../../utils/formatUtils';
import { ThumbsUp, ThumbsDown, Share2 } from 'lucide-react';

export const WatchPage: React.FC = () => {
    const { id } = useParams<{ id: string }>();
    const location = useLocation();
    const searchParams = new URLSearchParams(location.search);
    const playlistId = searchParams.get('list');

    const { videos, playlists, updateRecommendationOrder, recommendationOrders, hiddenPlaylistIds } = useVideo();
    const [currentVideo, setCurrentVideo] = useState<VideoDetails | null>(null);
    const [relatedVideos, setRelatedVideos] = useState<VideoDetails[]>([]);
    const [openMenuId, setOpenMenuId] = useState<string | null>(null);
    const [filter, setFilter] = useState<'all' | 'channel'>('all');

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

    useEffect(() => {
        if (id) {
            const foundVideo = videos.find(v => v.id === id);
            if (foundVideo) {
                setCurrentVideo(foundVideo);
            }
        }
    }, [id, videos]);

    // Logic to determine related videos (base list before filtering)
    useEffect(() => {
        if (currentVideo) {
            // Default behavior: Show all other videos
            const others = videos.filter(v => v.id !== currentVideo.id);
            setRelatedVideos(others);
        }
    }, [currentVideo, videos]);

    // Derive the list of recommended videos based on filters and order
    const recommendedVideos = useMemo(() => {
        if (!id || !currentVideo) return [];

        let filtered = [...relatedVideos];

        // 1. Apply Chip Filters
        if (filter === 'channel') {
            filtered = filtered.filter(v => v.channelTitle === currentVideo.channelTitle);
        }

        // 2. Apply Playlist Visibility Filter (Global)
        // If a video belongs ONLY to hidden playlists, hide it.
        // Logic: For each video, find all playlists it belongs to.
        // If it belongs to at least one visible playlist (or no playlists at all?), show it.
        // Wait, the Home Page logic is: "Hide videos from specific playlists".
        // If a video is in a hidden playlist, should it be hidden?
        // Usually, if I hide a playlist, I don't want to see its videos if they are ONLY in that playlist.
        // But if a video is in multiple playlists, and one is visible, it should probably show.
        // Let's use a strict "hide if in hidden playlist" approach for now, or match Home Page.
        // Home Page logic: `videos.filter(video => !hiddenVideoIds.has(video.id))` where hiddenVideoIds are derived from hidden playlists.
        // Let's replicate that logic.

        const hiddenVideoIds = new Set<string>();
        if (hiddenPlaylistIds.length > 0) {
            playlists.forEach(playlist => {
                if (hiddenPlaylistIds.includes(playlist.id)) {
                    playlist.videoIds.forEach(vidId => hiddenVideoIds.add(vidId));
                }
            });
        }

        // However, if a video is in a hidden playlist AND a visible playlist, should it be hidden?
        // The Home Page logic (VideoGrid.tsx) hides it if it's in ANY hidden playlist (implied by adding all IDs to the Set).
        // Let's refine: If a video is in a visible playlist, it should be shown?
        // Or is "Hidden Playlist" a strong "I don't want to see this content"?
        // Let's stick to the Home Page implementation for consistency: If it's in a hidden playlist, it's hidden.
        // Wait, let's check VideoGrid.tsx logic if possible.
        // Assuming the user wants to filter out specific content.

        filtered = filtered.filter(v => !hiddenVideoIds.has(v.id));


        // 3. Apply Sorting (only if 'all' filter is active, otherwise custom sort overrides)
        if (filter === 'all') {
            const savedOrder = recommendationOrders[id];
            if (savedOrder) {
                filtered.sort((a, b) => {
                    const indexA = savedOrder.indexOf(a.id);
                    const indexB = savedOrder.indexOf(b.id);
                    if (indexA !== -1 && indexB !== -1) return indexA - indexB;
                    if (indexA !== -1) return -1;
                    if (indexB !== -1) return 1;
                    return 0;
                });
            }
        }

        return filtered;
    }, [relatedVideos, id, currentVideo, filter, recommendationOrders, hiddenPlaylistIds, playlists]);

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;

        if (active.id !== over?.id && over && id) {
            // Only allow reordering when "All" filter is active to avoid confusion
            if (filter !== 'all') return;

            const oldIndex = recommendedVideos.findIndex((item) => item.id === active.id);
            const newIndex = recommendedVideos.findIndex((item) => item.id === over.id);

            const newOrder = [...recommendedVideos];
            const [movedItem] = newOrder.splice(oldIndex, 1);
            newOrder.splice(newIndex, 0, movedItem);

            // Save the new order of IDs
            updateRecommendationOrder(id, newOrder.map(v => v.id));
        }
    };

    if (!currentVideo) {
        return <div style={{ color: 'var(--text-primary)', padding: '24px' }}>Video not found</div>;
    }

    return (
        <div style={{
            display: 'flex',
            gap: '24px',
            padding: '24px',
            maxWidth: '1800px',
            margin: '0 auto',
            minHeight: '100vh',
            boxSizing: 'border-box'
        }}>
            {/* Main Content */}
            <div style={{ flex: 1, minWidth: 0 }}>
                {/* Video Player */}
                <div style={{
                    width: '100%',
                    aspectRatio: '16/9',
                    backgroundColor: 'black',
                    borderRadius: '12px',
                    overflow: 'hidden',
                    marginBottom: '12px'
                }}>
                    {currentVideo.isCustom ? (
                        <img src={currentVideo.customImage || currentVideo.thumbnail} alt={currentVideo.title} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                    ) : (
                        <iframe
                            width="100%"
                            height="100%"
                            src={`https://www.youtube.com/embed/${currentVideo.id}`}
                            title={currentVideo.title}
                            frameBorder="0"
                            allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                            allowFullScreen
                        ></iframe>
                    )}
                </div>

                {/* Video Info */}
                <h1 style={{ fontSize: '20px', fontWeight: 'bold', color: 'var(--text-primary)', marginBottom: '12px' }}>{currentVideo.title}</h1>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{ width: '40px', height: '40px', borderRadius: '50%', overflow: 'hidden', backgroundColor: 'var(--bg-secondary)' }}>
                            {currentVideo.channelAvatar && <img src={currentVideo.channelAvatar} alt={currentVideo.channelTitle} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                            <div style={{ fontWeight: 'bold', color: 'var(--text-primary)', fontSize: '16px' }}>{currentVideo.channelTitle}</div>
                            <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>1.2M subscribers</div>
                        </div>
                        <button style={{
                            backgroundColor: 'var(--text-primary)',
                            color: 'var(--bg-primary)',
                            border: 'none',
                            borderRadius: '18px',
                            padding: '0 16px',
                            height: '36px',
                            fontWeight: 'bold',
                            marginLeft: '24px',
                            cursor: 'pointer'
                        }}>Subscribe</button>
                    </div>

                    <div style={{ display: 'flex', gap: '8px' }}>
                        <div style={{ backgroundColor: 'var(--bg-secondary)', borderRadius: '18px', display: 'flex', alignItems: 'center', height: '36px' }}>
                            <button className="hover-bg" style={{ background: 'none', border: 'none', color: 'var(--text-primary)', padding: '0 16px', borderRight: '1px solid var(--border)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontWeight: '500', height: '100%', borderRadius: '18px 0 0 18px' }}>
                                <ThumbsUp size={18} /> 12K
                            </button>
                            <button className="hover-bg" style={{ background: 'none', border: 'none', color: 'var(--text-primary)', padding: '0 16px', cursor: 'pointer', height: '100%', borderRadius: '0 18px 18px 0', display: 'flex', alignItems: 'center' }}>
                                <ThumbsDown size={18} />
                            </button>
                        </div>
                        <button className="hover-bg" style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text-primary)', border: 'none', borderRadius: '18px', padding: '0 16px', height: '36px', fontWeight: '500', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <Share2 size={18} /> Share
                        </button>
                    </div>
                </div>

                {/* Description */}
                <div style={{ backgroundColor: 'var(--bg-secondary)', borderRadius: '12px', padding: '12px', fontSize: '14px', color: 'var(--text-primary)', marginBottom: '24px' }}>
                    <div style={{ fontWeight: 'bold', marginBottom: '8px' }}>{formatViewCount(currentVideo.viewCount)} views • {new Date(currentVideo.publishedAt).toLocaleDateString()}</div>
                    <div>
                        This is a placeholder description for the video. In a real application, this would be fetched from the YouTube API.
                        It can contain multiple lines of text, links, and hashtags.
                    </div>
                </div>

                {/* Comments Placeholder */}
                <div style={{ marginTop: '24px' }}>
                    <h3 style={{ fontSize: '20px', fontWeight: 'bold', color: 'var(--text-primary)', marginBottom: '24px' }}>Comments</h3>

                    {/* Add Comment Input */}
                    <div style={{ display: 'flex', gap: '16px', marginBottom: '32px' }}>
                        <div style={{ width: '40px', height: '40px', borderRadius: '50%', backgroundColor: 'var(--bg-secondary)', flexShrink: 0 }}>
                            {/* User Avatar Placeholder */}
                            <img src={localStorage.getItem('youtube_profile_avatar') || ''} style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover', display: localStorage.getItem('youtube_profile_avatar') ? 'block' : 'none' }} />
                        </div>
                        <div style={{ flex: 1 }}>
                            <input
                                type="text"
                                placeholder="Add a comment..."
                                style={{
                                    width: '100%',
                                    background: 'transparent',
                                    border: 'none',
                                    borderBottom: '1px solid var(--border)',
                                    padding: '8px 0',
                                    color: 'var(--text-primary)',
                                    outline: 'none'
                                }}
                            />
                        </div>
                    </div>

                    {/* Dummy Comments */}
                    {[1, 2, 3].map((i) => (
                        <div key={i} style={{ display: 'flex', gap: '16px', marginBottom: '24px' }}>
                            <div style={{ width: '40px', height: '40px', borderRadius: '50%', backgroundColor: 'var(--bg-secondary)', flexShrink: 0 }}></div>
                            <div>
                                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '4px' }}>
                                    <span style={{ fontWeight: 'bold', fontSize: '13px', color: 'var(--text-primary)' }}>@user{i}</span>
                                    <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>2 days ago</span>
                                </div>
                                <div style={{ fontSize: '14px', color: 'var(--text-primary)', marginBottom: '8px' }}>
                                    This is a placeholder comment to simulate the comments section. It looks just like the real thing!
                                </div>
                                <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
                                    <button style={{ background: 'none', border: 'none', color: 'var(--text-primary)', cursor: 'pointer', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                        <ThumbsUp size={14} /> 12
                                    </button>
                                    <button style={{ background: 'none', border: 'none', color: 'var(--text-primary)', cursor: 'pointer', fontSize: '12px', display: 'flex', alignItems: 'center' }}>
                                        <ThumbsDown size={14} />
                                    </button>
                                    <button style={{ background: 'none', border: 'none', color: 'var(--text-primary)', cursor: 'pointer', fontSize: '12px', fontWeight: '500' }}>Reply</button>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Sidebar Recommendations */}
            <div style={{ width: '400px', flexShrink: 0 }}>
                <WatchPageFilterBar
                    channelName={currentVideo.channelTitle}
                    selectedFilter={filter}
                    onFilterChange={setFilter}
                />

                <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragEnd={handleDragEnd}
                >
                    <SortableContext items={recommendedVideos} strategy={rectSortingStrategy}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            {recommendedVideos.map((v, index) => (
                                <div key={v.id} style={{
                                    zIndex: openMenuId === v.id ? 9999 : recommendedVideos.length - index,
                                    position: 'relative'
                                }}>
                                    <SortableRecommendationCard
                                        video={v}
                                        playlistId={playlistId || undefined}
                                        onMenuOpenChange={(isOpen) => setOpenMenuId(isOpen ? v.id : null)}
                                    />
                                </div>
                            ))}
                        </div>
                    </SortableContext>
                </DndContext>
            </div>
        </div>
    );
};
