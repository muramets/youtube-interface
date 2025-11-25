import React from 'react';
import { useParams } from 'react-router-dom';
import { useVideo } from '../../context/VideoContext';
import { VideoCard } from '../Video/VideoCard';
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
    const { videos, updateRecommendationOrder, recommendationOrders, watchPageCardsPerRow } = useVideo();
    const video = videos.find((v) => v.id === id);

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

    // Derive the list of recommended videos (excluding current)
    // and sort them based on the saved order for THIS video ID.
    const recommendedVideos = React.useMemo(() => {
        if (!id) return [];
        const otherVideos = videos.filter(v => v.id !== id);
        const savedOrder = recommendationOrders[id];

        if (!savedOrder) return otherVideos;

        // Sort based on savedOrder
        return [...otherVideos].sort((a, b) => {
            const indexA = savedOrder.indexOf(a.id);
            const indexB = savedOrder.indexOf(b.id);
            // If both are in the list, sort by index
            if (indexA !== -1 && indexB !== -1) return indexA - indexB;
            // If only A is in list, it comes first
            if (indexA !== -1) return -1;
            // If only B is in list, it comes first
            if (indexB !== -1) return 1;
            // If neither, keep original order (stable sort)
            return 0;
        });
    }, [videos, id, recommendationOrders]);

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;

        if (active.id !== over?.id && over && id) {
            const oldIndex = recommendedVideos.findIndex((item) => item.id === active.id);
            const newIndex = recommendedVideos.findIndex((item) => item.id === over.id);

            const newOrder = [...recommendedVideos];
            const [movedItem] = newOrder.splice(oldIndex, 1);
            newOrder.splice(newIndex, 0, movedItem);

            // Save the new order of IDs
            updateRecommendationOrder(id, newOrder.map(v => v.id));
        }
    };

    if (!video) {
        return <div style={{ color: 'var(--text-primary)', padding: '24px' }}>Video not found</div>;
    }

    // Calculate sidebar card scale based on cardsPerRow (3-9)
    // cardsPerRow = 3 (Large) -> scale = 1
    // cardsPerRow = 9 (Small) -> scale = 0.7 (example)
    const scale = Math.max(0.6, 1 - (watchPageCardsPerRow - 3) * 0.06);

    return (
        <div style={{ display: 'flex', gap: '24px', padding: '24px', maxWidth: '1800px', margin: '0 auto' }}>
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
                    {video.isCustom ? (
                        <img src={video.customImage || video.thumbnail} alt={video.title} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                    ) : (
                        <iframe
                            width="100%"
                            height="100%"
                            src={`https://www.youtube.com/embed/${video.id}`}
                            title={video.title}
                            frameBorder="0"
                            allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                            allowFullScreen
                        ></iframe>
                    )}
                </div>

                {/* Video Info */}
                <h1 style={{ fontSize: '20px', fontWeight: 'bold', color: 'var(--text-primary)', marginBottom: '12px' }}>{video.title}</h1>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{ width: '40px', height: '40px', borderRadius: '50%', overflow: 'hidden', backgroundColor: 'var(--bg-secondary)' }}>
                            {video.channelAvatar && <img src={video.channelAvatar} alt={video.channelTitle} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                            <div style={{ fontWeight: 'bold', color: 'var(--text-primary)', fontSize: '16px' }}>{video.channelTitle}</div>
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
                    <div style={{ fontWeight: 'bold', marginBottom: '8px' }}>{formatViewCount(video.viewCount)} views • {new Date(video.publishedAt).toLocaleDateString()}</div>
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
                <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragEnd={handleDragEnd}
                >
                    <SortableContext items={recommendedVideos} strategy={rectSortingStrategy}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            {recommendedVideos.map((v, index) => (
                                <div key={v.id} style={{
                                    transform: `scale(${scale})`,
                                    transformOrigin: 'top left',
                                    marginBottom: `calc(-${(1 - scale) * 100}% + 12px)`,
                                    zIndex: recommendedVideos.length - index,
                                    position: 'relative'
                                }}>
                                    <VideoCard video={v} />
                                </div>
                            ))}
                        </div>
                    </SortableContext>
                </DndContext>
            </div>
        </div>
    );
};
