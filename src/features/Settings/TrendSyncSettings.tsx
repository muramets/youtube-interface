import { Toggle } from '../../components/ui/atoms/Toggle/Toggle';
import { Info, AlertTriangle } from 'lucide-react';
import type { SyncSettings } from '../../core/services/settingsService';
import { useEffect, useState } from 'react';
import { TrendService } from '../../core/services/trendService';
import { useTrendStore } from '../../core/stores/trends/trendStore';

interface TrendSyncSettingsProps {
    settings: SyncSettings;
    onChange: (settings: SyncSettings) => void;
    theme: {
        isDark: boolean;
        borderColor: string;
        textSecondary: string;
        bgMain: string;
        textPrimary: string;
    };
}

export const TrendSyncSettings: React.FC<TrendSyncSettingsProps> = ({
    settings,
    onChange,
    theme
}) => {
    const isEnabled = settings.trendSync?.enabled ?? false;
    const { channels } = useTrendStore();
    const [totalVideos, setTotalVideos] = useState<number | null>(null);

    useEffect(() => {
        const fetchStats = async () => {
            const visibleChannelIds = channels.filter(c => c.isVisible).map(c => c.id);
            const count = await TrendService.getVideoCountForChannels(visibleChannelIds);
            setTotalVideos(count);
        };
        fetchStats();
    }, [channels]); // Re-run if channels change (e.g. visibility toggled)

    // Estimate Quota (Full Sync Strategy):
    // 1. List Requests: ~ Math.ceil(Total Videos / 50)
    // 2. Details Requests: ~ Math.ceil(Total Videos / 50)
    // Total: ~ 2 units per 50 videos.
    // We add a small buffer (Channels count) for empty/partial pages overhead.
    const visibleChannelsCount = channels.filter(c => c.isVisible).length;
    const estimatedQuota = totalVideos !== null
        ? (Math.ceil(totalVideos / 50) * 2) + Math.ceil(visibleChannelsCount * 0.5)
        : 0;


    const handleToggle = (checked: boolean) => {
        onChange({
            ...settings,
            trendSync: {
                ...settings.trendSync,
                enabled: checked
            }
        });
    };

    return (
        <div className="space-y-6">
            <div>
                <h3 className={`text-lg font-medium mb-1 ${theme.textPrimary}`}>Trending Videos Sync</h3>
                <p className={`text-sm ${theme.textSecondary}`}>
                    Configure background synchronization for tracking daily view performance.
                </p>
            </div>

            <div className={`p-4 rounded-xl border ${theme.borderColor} bg-white/5 space-y-4`}>
                <div className="flex items-center justify-between">
                    <div>
                        <div className={`font-medium ${theme.textPrimary}`}>Daily Background Sync</div>
                        <div className={`text-sm ${theme.textSecondary} mt-1`}>
                            Automatically update channel data once every 24 hours.
                        </div>
                    </div>
                    <Toggle
                        checked={isEnabled}
                        onChange={handleToggle}
                        size="md"
                    />
                </div>

                {isEnabled && (
                    <div className="pt-4 border-t border-dashed border-white/10 space-y-3">
                        <div className="flex items-start gap-3 p-3 rounded-lg bg-blue-500/10 border border-blue-500/20">
                            <Info size={16} className="text-blue-400 mt-0.5" />
                            <div className="text-sm text-blue-200">
                                <span className="font-semibold text-blue-100">Server-Side Execution:</span>
                                {' '}This setting enables the Cloud Function to run independently of your browser session.
                                It ensures consistent 24h intervals for accurate analytics.
                            </div>
                        </div>

                        <div className="flex items-start gap-3 p-3 rounded-lg bg-orange-500/10 border border-orange-500/20">
                            <AlertTriangle size={16} className="text-orange-400 mt-0.5" />
                            <div className="text-sm text-orange-200">
                                <span className="font-semibold text-orange-100">Quota Usage:</span>
                                {' '}Updates {visibleChannelsCount} visible channels.
                                {totalVideos !== null ? (
                                    <>
                                        {' '}Current load: <span className="font-mono font-bold">{totalVideos.toLocaleString()}</span> videos.
                                        {' '}Estimated daily consumption: <span className="font-mono font-bold">~{estimatedQuota}</span> units.
                                    </>
                                ) : (
                                    ' Calculating...'
                                )}
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {!isEnabled && (
                <div className={`text-sm ${theme.textSecondary} italic pl-1`}>
                    Enable this feature to unlock "Last 24h", "Last 7d", and "Last 30d" columns in the Trends Table.
                </div>
            )}
        </div>
    );
};
