import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useTrendStore } from '../stores/trendStore';
import { TimelineCanvas } from '../components/Trends/Timeline/TimelineCanvas';
import { RefreshCw, Settings, Check, Maximize2 } from 'lucide-react';
import { TrendService } from '../services/trendService';
import { useAuth } from '../hooks/useAuth';
import { useSettings } from '../hooks/useSettings';
import { createPortal } from 'react-dom';

interface VideoNode {
    id: string;
    title: string;
    thumbnail: string;
    viewCount: number;
    publishedAt: string;
    publishedAtTimestamp: number;
    description?: string;
    tags?: string[];
    channelId: string;
    channelTitle?: string;
}

export const TrendsPage: React.FC = () => {
    const { channels, selectedChannelId, timelineConfig, setTimelineConfig } = useTrendStore();
    const { user } = useAuth();
    const { generalSettings } = useSettings();
    const [isSyncing, setIsSyncing] = useState(false);
    const [videos, setVideos] = useState<VideoNode[]>([]);

    // Settings Dropdown State
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [settingsView, setSettingsView] = useState<'main' | 'scaling'>('main');
    const settingsButtonRef = useRef<HTMLButtonElement>(null);
    const settingsDropdownRef = useRef<HTMLDivElement>(null);

    const activeChannel = selectedChannelId ? channels.find(c => c.id === selectedChannelId) : null;

    // Computed visible channels (lifted from TimelineCanvas)
    const visibleChannels = useMemo(() => {
        if (selectedChannelId) {
            return channels.filter(c => c.id === selectedChannelId);
        }
        return channels.filter(c => c.isVisible);
    }, [channels, selectedChannelId]);

    // Load videos (lifted from TimelineCanvas)
    useEffect(() => {
        const loadVideos = async () => {
            const allVideos: VideoNode[] = [];
            for (const channel of visibleChannels) {
                const channelVideos = await TrendService.getChannelVideosFromCache(channel.id);
                allVideos.push(...channelVideos.map(v => ({
                    ...v,
                    channelTitle: channel.title
                })));
            }
            allVideos.sort((a, b) => a.publishedAtTimestamp - b.publishedAtTimestamp);
            setVideos(allVideos);
        };
        loadVideos();
    }, [visibleChannels]);

    // Close dropdown on click outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (
                settingsDropdownRef.current &&
                !settingsDropdownRef.current.contains(event.target as Node) &&
                settingsButtonRef.current &&
                !settingsButtonRef.current.contains(event.target as Node)
            ) {
                setIsSettingsOpen(false);
                setTimeout(() => setSettingsView('main'), 200); // Reset on close
            }
        };

        if (isSettingsOpen) {
            document.addEventListener('mousedown', handleClickOutside);
        }
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [isSettingsOpen]);

    const handleSync = async () => {
        if (!user || isSyncing) return;

        const apiKey = generalSettings.apiKey;
        if (!apiKey) {
            console.error('No API Key configured');
            return;
        }

        setIsSyncing(true);
        // Close dropdown if open
        setIsSettingsOpen(false);
        setSettingsView('main');

        try {
            console.log('[TrendsPage] Starting manual sync...');
            await Promise.all(channels.map(channel =>
                TrendService.syncChannelVideos(user.uid, channel, apiKey)
            ));
            console.log('[TrendsPage] Manual sync complete');
            window.location.reload();
        } catch (e) {
            console.error('Sync failed', e);
        } finally {
            setIsSyncing(false);
        }
    };

    return (
        <div className="flex flex-col h-full bg-bg-primary">
            {/* Toolbar */}
            <div className="h-14 border-b border-border flex items-center px-4 justify-between flex-shrink-0 bg-bg-primary z-30">
                <h1 className="text-xl font-semibold text-text-primary">
                    <span className="text-text-secondary">Trends Analysis:</span> {activeChannel ? activeChannel.title : 'All Channels'}
                </h1>

                <div className="flex items-center gap-6">
                    {/* Stats Block */}
                    <div className="flex items-center gap-4 text-sm">
                        <div className="text-text-secondary">
                            <span className="text-text-primary font-medium">{videos.length}</span> videos
                        </div>
                        <div className="text-text-secondary">
                            <span className="text-text-primary font-medium">{channels.length}</span> {channels.length === 1 ? 'channel' : 'channels'} tracked
                        </div>
                    </div>

                    {/* Settings Gear */}
                    <div className="relative">
                        <button
                            ref={settingsButtonRef}
                            onClick={() => {
                                setIsSettingsOpen(!isSettingsOpen);
                                if (isSettingsOpen) setTimeout(() => setSettingsView('main'), 200);
                            }}
                            className={`p-2 rounded-lg transition-colors ${isSettingsOpen ? 'bg-bg-secondary text-text-primary' : 'text-text-secondary hover:text-text-primary hover:bg-bg-secondary'}`}
                        >
                            <Settings size={20} />
                        </button>

                        {isSettingsOpen && createPortal(
                            <div
                                ref={settingsDropdownRef}
                                className="fixed bg-bg-secondary border border-border rounded-xl py-1 shadow-2xl z-[1000] w-[240px] animate-scale-in text-text-primary overflow-hidden"
                                style={{
                                    top: (settingsButtonRef.current?.getBoundingClientRect().bottom ?? 0) + 8,
                                    right: 16 // Align with right padding (px-4 = 16px)
                                }}
                            >
                                {settingsView === 'main' ? (
                                    <div className="py-1">
                                        {/* Size Scaling Menu Item */}
                                        <div
                                            onClick={() => setSettingsView('scaling')}
                                            className="px-4 py-2.5 flex items-center justify-between cursor-pointer hover:bg-hover-bg transition-colors"
                                        >
                                            <div className="flex items-center gap-3">
                                                <div className="w-5 h-5 flex items-center justify-center">
                                                    <Maximize2 size={20} />
                                                </div>
                                                <span className="text-sm">Scaling: {timelineConfig.scalingMode === 'linear' ? 'Linear' : 'Logarithmic'}</span>
                                            </div>
                                            <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" className="text-text-secondary"><path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z" /></svg>
                                        </div>

                                        <div className="h-px bg-border my-1" />

                                        {/* Sync Now Item */}
                                        <div
                                            onClick={handleSync}
                                            className={`px-4 py-2.5 flex items-center gap-3 cursor-pointer hover:bg-hover-bg text-text-primary text-sm transition-colors ${isSyncing ? 'opacity-50 pointer-events-none' : ''}`}
                                        >
                                            <div className="w-5 h-5 flex items-center justify-center">
                                                <RefreshCw size={20} className={isSyncing ? 'animate-spin' : ''} />
                                            </div>
                                            <span>{isSyncing ? 'Syncing...' : 'Sync Now'}</span>
                                        </div>
                                    </div>
                                ) : (
                                    /* Scaling Submenu */
                                    <div className="pb-2">
                                        <div className="px-4 py-3 flex items-center gap-2 border-b border-border mb-2">
                                            <button
                                                onClick={() => setSettingsView('main')}
                                                className="p-1 -ml-2 hover:bg-hover-bg rounded-full text-text-primary"
                                            >
                                                <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z" /></svg>
                                            </button>
                                            <span className="text-base font-medium">Size Scaling</span>
                                        </div>

                                        <div className="px-4 py-2 text-xs text-text-secondary">
                                            Adjust how video thumbnails are sized
                                        </div>

                                        <div
                                            onClick={() => setTimelineConfig({ scalingMode: 'linear' })}
                                            className="px-4 py-2.5 flex items-center justify-between cursor-pointer hover:bg-hover-bg transition-colors"
                                        >
                                            <div className="flex flex-col">
                                                <span className="text-sm text-text-primary">Linear</span>
                                                <span className="text-xs text-text-secondary">Proportional to views</span>
                                            </div>
                                            {timelineConfig.scalingMode === 'linear' && <Check size={20} className="text-text-primary" />}
                                        </div>

                                        <div
                                            onClick={() => setTimelineConfig({ scalingMode: 'log' })}
                                            className="px-4 py-2.5 flex items-center justify-between cursor-pointer hover:bg-hover-bg transition-colors"
                                        >
                                            <div className="flex flex-col">
                                                <span className="text-sm text-text-primary">Logarithmic</span>
                                                <span className="text-xs text-text-secondary">Less extreme differences</span>
                                            </div>
                                            {timelineConfig.scalingMode === 'log' && <Check size={20} className="text-text-primary" />}
                                        </div>
                                    </div>
                                )}
                            </div>,
                            document.body
                        )}
                    </div>
                </div>
            </div>

            {/* Timeline Area (pass loaded videos) */}
            <TimelineCanvas
                key={selectedChannelId || 'global'}
                videos={videos}
            />
        </div>
    );
};
