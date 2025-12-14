import React, { useState } from 'react';
import { useTrendStore } from '../stores/trendStore';
import { TimelineCanvas } from '../components/Trends/Timeline/TimelineCanvas';
import { RefreshCw } from 'lucide-react';
import { TrendService } from '../services/trendService';
import { useAuth } from '../hooks/useAuth';
import { useSettings } from '../hooks/useSettings';

export const TrendsPage: React.FC = () => {
    const { channels, selectedChannelId } = useTrendStore();
    const { user } = useAuth();
    const { generalSettings } = useSettings();
    const [isSyncing, setIsSyncing] = useState(false);

    const activeChannel = selectedChannelId ? channels.find(c => c.id === selectedChannelId) : null;

    const handleSync = async () => {
        if (!user || isSyncing) return;

        const apiKey = generalSettings.apiKey;
        if (!apiKey) {
            console.error('No API Key configured');
            return;
        }

        setIsSyncing(true);
        try {
            console.log('[TrendsPage] Starting manual sync...');
            await Promise.all(channels.map(channel =>
                TrendService.syncChannelVideos(user.uid, channel, apiKey)
            ));
            console.log('[TrendsPage] Manual sync complete');
            // Force reload of timeline data? The service updates IndexedDB, component tracks listen to channel.id which doesn't change.
            // But we might need to trigger a re-read in ChannelTrack.
            // Actually, ChannelTrack only reads on mount or channel.id change.
            // We need a force update mechanism. For now, let's just rely on the logs confirming data arrived.
            // A simple hack is reloading the page, but let's try to pass a version stamp to store later.
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
            <div className="h-14 border-b border-border flex items-center px-6 justify-between flex-shrink-0 bg-bg-primary z-30">
                <h1 className="text-xl font-semibold text-text-primary">
                    <span className="text-text-secondary">Trends Analysis:</span> {activeChannel ? activeChannel.title : 'All Channels'}
                </h1>
                <div className="flex items-center gap-4">
                    <button
                        onClick={handleSync}
                        disabled={isSyncing}
                        className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${isSyncing ? 'text-text-tertiary' : 'text-text-secondary hover:text-text-primary hover:bg-bg-secondary'}`}
                    >
                        <RefreshCw size={14} className={isSyncing ? 'animate-spin' : ''} />
                        {isSyncing ? 'Syncing...' : 'Sync Data'}
                    </button>
                    <div className="text-sm text-text-secondary">
                        {channels.length} {channels.length === 1 ? 'channel' : 'channels'} tracked
                    </div>
                </div>
            </div>

            {/* Timeline Area */}
            <TimelineCanvas />
        </div>
    );
};
