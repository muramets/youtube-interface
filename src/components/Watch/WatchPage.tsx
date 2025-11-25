import React, { useState, useEffect } from 'react';
import { useParams, useLocation } from 'react-router-dom';
import { useVideo } from '../../context/VideoContext';
import { SortableVideoCard } from '../Video/SortableVideoCard';
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

    const { videos, watchPageCardsPerRow, playlists, updateRecommendationOrder, recommendationOrders } = useVideo();
    const [currentVideo, setCurrentVideo] = useState<VideoDetails | null>(null);
    const [relatedVideos, setRelatedVideos] = useState<VideoDetails[]>([]);
    const [openMenuId, setOpenMenuId] = useState<string | null>(null);

    // New state for playlist filtering
    const [activePlaylist, setActivePlaylist] = useState<{ id: string, name: string } | null>(null);
    const [availablePlaylists, setAvailablePlaylists] = useState<{ id: string, name: string }[]>([]);
    const [showPlaylistVideos, setShowPlaylistVideos] = useState(true);
    const [showPlaylistSelector, setShowPlaylistSelector] = useState(false);

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

    // Logic to determine related videos and active playlist
    useEffect(() => {
        if (currentVideo) {
            // Find ALL playlists containing this video
            const containingPlaylists = playlists.filter(p => p.videoIds.includes(currentVideo.id) && p.videoIds.length > 1);
            setAvailablePlaylists(containingPlaylists.map(p => ({ id: p.id, name: p.name })));

            let playlistToUse = null;

            // If we already have an active playlist and it still contains the video, keep it
            if (activePlaylist && containingPlaylists.some(p => p.id === activePlaylist.id)) {
                playlistToUse = playlists.find(p => p.id === activePlaylist.id);
            }
            // Otherwise, prioritize URL param
            else if (playlistId) {
                playlistToUse = playlists.find(p => p.id === playlistId);
            }
            // Finally, default to the first found playlist
            else if (containingPlaylists.length > 0) {
                playlistToUse = containingPlaylists[0];
            }

            if (playlistToUse) {
                // Only update active playlist if it changed or wasn't set
                if (!activePlaylist || activePlaylist.id !== playlistToUse.id) {
                    setActivePlaylist({ id: playlistToUse.id, name: playlistToUse.name });
                }

                if (showPlaylistVideos) {
                    const playlistVids = playlistToUse.videoIds
                        .map(vidId => videos.find(v => v.id === vidId))
                        .filter((v): v is VideoDetails => v !== undefined);
                    setRelatedVideos(playlistVids);
                    return;
                }
            } else {
                setActivePlaylist(null);
            }

            // Default behavior (or if toggle is off): Filter out current video and show others
            const others = videos.filter(v => v.id !== currentVideo.id);
            setRelatedVideos(others);
        }
    }, [currentVideo, videos, playlistId, playlists, showPlaylistVideos, activePlaylist?.id]); // Added activePlaylist.id dependency to prevent loop but allow updates

    // Derive the list of recommended videos (excluding current)
    // and sort them based on the saved order for THIS video ID.
    const recommendedVideos = React.useMemo(() => {
        if (!id) return [];
        // Use relatedVideos instead of filtering videos again
        const otherVideos = relatedVideos.filter(v => v.id !== id);

        if (activePlaylist && showPlaylistVideos) {
            // If in playlist mode, `relatedVideos` is already the playlist videos in order.
            // We just filtered out the current one above.
            // So we return `otherVideos` as is (which preserves playlist order minus current).
            return otherVideos;
        }

        const savedOrder = recommendationOrders[id];
        if (!savedOrder) return otherVideos;

        // Sort based on savedOrder
        return [...otherVideos].sort((a, b) => {
            const indexA = savedOrder.indexOf(a.id);
            const indexB = savedOrder.indexOf(b.id);
            if (indexA !== -1 && indexB !== -1) return indexA - indexB;
            if (indexA !== -1) return -1;
            if (indexB !== -1) return 1;
            return 0;
        });
    }, [relatedVideos, id, recommendationOrders, activePlaylist, showPlaylistVideos]);

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;

        if (active.id !== over?.id && over && id) {
            // If in playlist mode, maybe disable reordering or update playlist?
            // For now, let's only allow reordering "Recommendations" (All Videos mode).
            if (activePlaylist && showPlaylistVideos) return;

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

    // Calculate sidebar card scale based on cardsPerRow (3-9)
    // cardsPerRow = 3 (Large) -> scale = 1
    // cardsPerRow = 9 (Small) -> scale = 0.7 (example)
    const scale = Math.max(0.6, 1 - (watchPageCardsPerRow - 3) * 0.06);

    return (
        <div style={{
            display: 'flex',
            gap: '24px',
            padding: '24px',
            maxWidth: '1800px',
            margin: '0 auto',
            minHeight: '100vh', // Ensure full height
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
                {activePlaylist && (
                    <div style={{
                        marginBottom: '16px',
                        padding: '12px',
                        backgroundColor: 'var(--bg-secondary)',
                        borderRadius: '12px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        position: 'relative',
                        zIndex: 100
                    }}>
                        <div
                            style={{ cursor: availablePlaylists.length > 1 ? 'pointer' : 'default', display: 'flex', flexDirection: 'column', gap: '2px' }}
                            onClick={() => availablePlaylists.length > 1 && setShowPlaylistSelector(!showPlaylistSelector)}
                        >
                            <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Playing from</div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                <div style={{ fontWeight: 'bold', color: 'var(--text-primary)' }}>{activePlaylist.name}</div>
                                {availablePlaylists.length > 1 && (
                                    <div style={{ transform: showPlaylistSelector ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s', display: 'flex', alignItems: 'center' }}>
                                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
                                    </div>
                                )}
                            </div>
                        </div>

                        {showPlaylistSelector && (
                            <div style={{
                                position: 'absolute',
                                top: '100%',
                                left: 0,
                                right: 0,
                                backgroundColor: 'var(--bg-secondary)',
                                borderRadius: '12px',
                                padding: '8px',
                                marginTop: '4px',
                                boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '4px'
                            }}>
                                {availablePlaylists.map(p => (
                                    <div
                                        key={p.id}
                                        className="hover-bg"
                                        onClick={() => {
                                            setActivePlaylist(p);
                                            setShowPlaylistSelector(false);
                                        }}
                                        style={{
                                            padding: '8px',
                                            borderRadius: '8px',
                                            cursor: 'pointer',
                                            fontWeight: p.id === activePlaylist.id ? 'bold' : 'normal',
                                            color: p.id === activePlaylist.id ? 'var(--text-primary)' : 'var(--text-secondary)'
                                        }}
                                    >
                                        {p.name}
                                    </div>
                                ))}
                            </div>
                        )}

                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ fontSize: '12px', color: !showPlaylistVideos ? 'var(--text-primary)' : 'var(--text-secondary)' }}>All</span>
                            <div
                                onClick={() => setShowPlaylistVideos(!showPlaylistVideos)}
                                style={{
                                    width: '40px',
                                    height: '20px',
                                    backgroundColor: showPlaylistVideos ? '#3ea6ff' : 'var(--border)',
                                    borderRadius: '10px',
                                    position: 'relative',
                                    cursor: 'pointer',
                                    transition: 'background-color 0.2s'
                                }}
                            >
                                <div style={{
                                    width: '16px',
                                    height: '16px',
                                    backgroundColor: 'white',
                                    borderRadius: '50%',
                                    position: 'absolute',
                                    top: '2px',
                                    left: showPlaylistVideos ? '22px' : '2px',
                                    transition: 'left 0.2s'
                                }}></div>
                            </div>
                            <span style={{ fontSize: '12px', color: showPlaylistVideos ? 'var(--text-primary)' : 'var(--text-secondary)' }}>Playlist</span>
                        </div>
                    </div>
                )}

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
                                    <SortableVideoCard
                                        video={v}
                                        playlistId={playlistId || undefined}
                                        scale={scale}
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
