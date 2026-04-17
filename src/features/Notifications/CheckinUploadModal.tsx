// =============================================================================
// ⚠️ DEAD CODE — NOT RENDERED ANYWHERE (2026-04-14)
//
// Check-in notifications now navigate to the video's Traffic Sources tab
// instead of opening this modal. See `NotificationDropdown.handleNotificationAction`
// and `useCheckinScheduler` (link → `?tab=trafficSource`).
//
// Kept temporarily in case we revert to the modal flow. If the navigation
// flow sticks (a couple of weeks of production use), DELETE:
//   - this file
//   - `checkinUpload` state + `openCheckinUpload` / `closeCheckinUpload` in uiStore.ts
//   - `ruleId` field in the checkinUpload type
// =============================================================================

import React, { useState, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { X, Check } from 'lucide-react';
import { CsvDropZone } from '../../components/ui/molecules/CsvDropZone';
import { useUIStore } from '../../core/stores/uiStore';
import { useAuth } from '../../core/hooks/useAuth';
import { useChannelStore } from '../../core/stores/channelStore';
import { useVideos } from '../../core/hooks/useVideos';
import { useSettings } from '../../core/hooks/useSettings';
import { TrafficSnapshotService } from '../../core/services/traffic/TrafficSnapshotService';
import { TrafficSourceService } from '../../core/services/suggestedTraffic/TrafficSourceService';
import { parseTrafficCsv } from '../../pages/Details/tabs/Traffic/utils/csvParser';
import { parseTrafficSourceCsv } from '../../core/utils/trafficSource/parser';
import { calculateDueDate } from '../../core/utils/dueDateUtils';
import { logger } from '../../core/utils/logger';

export const CheckinUploadModal: React.FC = () => {
    const checkinUpload = useUIStore(s => s.checkinUpload);
    const closeCheckinUpload = useUIStore(s => s.closeCheckinUpload);
    const showToast = useUIStore(s => s.showToast);
    const { user } = useAuth();
    const { currentChannel } = useChannelStore();
    const { videos } = useVideos(user?.uid || '', currentChannel?.id || '');
    const { packagingSettings } = useSettings();

    // Determine which CSVs are already uploaded for this rule's due date
    const { needsSuggested, needsTrafficSource } = useMemo(() => {
        if (!checkinUpload) return { needsSuggested: true, needsTrafficSource: true };
        const video = videos.find(v => v.id === checkinUpload.videoId);
        const rule = packagingSettings.checkinRules.find(r => r.id === checkinUpload.ruleId);
        if (!video?.publishedAt || !rule) return { needsSuggested: true, needsTrafficSource: true };

        const dueTime = calculateDueDate(video.publishedAt, rule.hoursAfterPublish);
        const GRACE_MS = 6 * 60 * 60 * 1000;
        return {
            needsSuggested: (video.lastSuggestedTrafficUpload ?? 0) < (dueTime - GRACE_MS),
            needsTrafficSource: (video.lastTrafficSourceUpload ?? 0) < (dueTime - GRACE_MS),
        };
    }, [checkinUpload, videos, packagingSettings]);

    const [suggestedStatus, setSuggestedStatus] = useState<'idle' | 'uploading' | 'done' | 'error'>('idle');
    const [trafficSourceStatus, setTrafficSourceStatus] = useState<'idle' | 'uploading' | 'done' | 'error'>('idle');
    const [suggestedError, setSuggestedError] = useState<string | null>(null);
    const [trafficSourceError, setTrafficSourceError] = useState<string | null>(null);
    const [isClosing, setIsClosing] = useState(false);

    const handleClose = useCallback(() => {
        setIsClosing(true);
        setTimeout(() => {
            closeCheckinUpload();
            setIsClosing(false);
            setSuggestedStatus('idle');
            setTrafficSourceStatus('idle');
            setSuggestedError(null);
            setTrafficSourceError(null);
        }, 200);
    }, [closeCheckinUpload]);

    const handleSuggestedTrafficUpload = useCallback(async (file: File) => {
        if (!user || !currentChannel || !checkinUpload) return;

        const video = videos.find(v => v.id === checkinUpload.videoId);
        if (!video) return;

        setSuggestedStatus('uploading');
        setSuggestedError(null);

        try {
            const { sources, totalRow } = await parseTrafficCsv(file);
            const version = (typeof video.activeVersion === 'number' ? video.activeVersion : undefined)
                ?? video.currentPackagingVersion ?? 1;
            const publishDate = video.publishedAt ? new Date(video.publishedAt).getTime() : undefined;

            const snapshotId = await TrafficSnapshotService.create(
                user.uid, currentChannel.id, video.id,
                version, sources, totalRow, file, publishDate
            );

            // Set label to badge text (e.g. "24 hours snapshot")
            await TrafficSnapshotService.updateMetadata(
                user.uid, currentChannel.id, video.id,
                snapshotId, { label: checkinUpload.badgeText }
            );

            setSuggestedStatus('done');
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Upload failed';
            if (message === 'MAPPING_REQUIRED') {
                setSuggestedError('Could not auto-detect CSV columns. Please upload via the Suggested Traffic tab.');
            } else if (message === 'NO_VIDEO_DATA') {
                setSuggestedError('No video data found in CSV. Make sure this is a Suggested Traffic export.');
            } else {
                setSuggestedError(message);
            }
            setSuggestedStatus('error');
            logger.error('Checkin suggested traffic upload failed', { error: err, component: 'CheckinUploadModal' });
        }
    }, [user, currentChannel, checkinUpload, videos]);

    const handleTrafficSourceUpload = useCallback(async (file: File) => {
        if (!user || !currentChannel || !checkinUpload) return;

        const video = videos.find(v => v.id === checkinUpload.videoId);
        if (!video) return;

        setTrafficSourceStatus('uploading');
        setTrafficSourceError(null);

        try {
            const { metrics, totalRow } = await parseTrafficSourceCsv(file);

            const snapshotId = await TrafficSourceService.createSnapshot(
                user.uid, currentChannel.id, video.id,
                metrics, totalRow, file, video.publishedAt
            );

            // Set label to badge text
            await TrafficSourceService.updateSnapshotMetadata(
                user.uid, currentChannel.id, video.id,
                snapshotId, { label: checkinUpload.badgeText }
            );

            setTrafficSourceStatus('done');
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Upload failed';
            if (message === 'MAPPING_REQUIRED') {
                setTrafficSourceError('Could not auto-detect CSV columns. Please upload via the Traffic Sources tab.');
            } else if (message === 'NO_DATA') {
                setTrafficSourceError('No data found in CSV. Make sure this is a Traffic Sources export.');
            } else {
                setTrafficSourceError(message);
            }
            setTrafficSourceStatus('error');
            logger.error('Checkin traffic source upload failed', { error: err, component: 'CheckinUploadModal' });
        }
    }, [user, currentChannel, checkinUpload, videos]);

    // Auto-close when Traffic Sources CSV is uploaded (the only required CSV for check-in completion).
    // Suggested Traffic is optional — modal stays open for it, but doesn't block completion.
    const allDone = trafficSourceStatus === 'done';
    React.useEffect(() => {
        if (allDone) {
            const timer = setTimeout(() => {
                showToast('Check-in complete! Snapshots uploaded.', 'success');
                handleClose();
            }, 800);
            return () => clearTimeout(timer);
        }
    }, [allDone, showToast, handleClose]);

    if (!checkinUpload) return null;

    return createPortal(
        <div
            className={`fixed inset-0 z-modal flex items-center justify-center p-4 backdrop-blur-sm ${isClosing ? 'animate-fade-out' : 'animate-fade-in'}`}
            style={{ backgroundColor: 'var(--modal-overlay)' }}
            onClick={handleClose}
        >
            <div
                className={`relative w-[520px] bg-bg-secondary rounded-xl shadow-2xl flex flex-col overflow-hidden ${isClosing ? 'animate-scale-out' : 'animate-scale-in'}`}
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className="px-5 py-4 border-b border-border flex items-center gap-3">
                    {checkinUpload.thumbnail && (
                        <div
                            className="w-16 aspect-video rounded-md overflow-hidden border flex-shrink-0"
                            style={{ borderColor: `${checkinUpload.badgeColor}60` }}
                        >
                            <img src={checkinUpload.thumbnail} alt="" className="w-full h-full object-cover" />
                        </div>
                    )}
                    <div className="flex-1 min-w-0">
                        <h3 className="text-sm font-medium text-text-primary truncate">Packaging Check-in</h3>
                        <span
                            className="inline-block mt-1 px-2 py-0.5 rounded text-[11px] font-medium text-white"
                            style={{ backgroundColor: checkinUpload.badgeColor }}
                        >
                            {checkinUpload.badgeText}
                        </span>
                    </div>
                    <button
                        onClick={handleClose}
                        className="p-1.5 rounded-lg text-text-tertiary hover:text-text-primary hover:bg-hover-bg transition-colors"
                    >
                        <X size={18} />
                    </button>
                </div>

                {/* Body */}
                <div className="p-5 space-y-4">
                    {/* Suggested Traffic */}
                    <div>
                        <div className="flex items-center gap-2 mb-2">
                            <label className="text-xs font-medium text-text-secondary uppercase tracking-wider">
                                Suggested Traffic CSV
                            </label>
                            {(!needsSuggested || suggestedStatus === 'done') && <Check size={14} className="text-green-500" />}
                        </div>
                        {!needsSuggested ? (
                            <div className="h-10 rounded-lg border border-green-500/20 bg-green-500/5 flex items-center justify-center text-xs text-green-500">
                                Already uploaded
                            </div>
                        ) : suggestedStatus === 'done' ? (
                            <div className="h-[130px] rounded-xl border border-green-500/30 bg-green-500/5 flex items-center justify-center text-sm text-green-500">
                                Uploaded
                            </div>
                        ) : (
                            <>
                                <CsvDropZone
                                    onFileSelect={handleSuggestedTrafficUpload}
                                    isProcessing={suggestedStatus === 'uploading'}
                                    processingLabel="Uploading..."
                                    height="130px"
                                />
                                {suggestedError && (
                                    <p className="mt-1.5 text-xs text-color-error">{suggestedError}</p>
                                )}
                            </>
                        )}
                    </div>

                    {/* Traffic Sources */}
                    <div>
                        <div className="flex items-center gap-2 mb-2">
                            <label className="text-xs font-medium text-text-secondary uppercase tracking-wider">
                                Traffic Sources CSV
                            </label>
                            {(!needsTrafficSource || trafficSourceStatus === 'done') && <Check size={14} className="text-green-500" />}
                        </div>
                        {!needsTrafficSource ? (
                            <div className="h-10 rounded-lg border border-green-500/20 bg-green-500/5 flex items-center justify-center text-xs text-green-500">
                                Already uploaded
                            </div>
                        ) : trafficSourceStatus === 'done' ? (
                            <div className="h-[130px] rounded-xl border border-green-500/30 bg-green-500/5 flex items-center justify-center text-sm text-green-500">
                                Uploaded
                            </div>
                        ) : (
                            <>
                                <CsvDropZone
                                    onFileSelect={handleTrafficSourceUpload}
                                    isProcessing={trafficSourceStatus === 'uploading'}
                                    processingLabel="Uploading..."
                                    height="130px"
                                />
                                {trafficSourceError && (
                                    <p className="mt-1.5 text-xs text-color-error">{trafficSourceError}</p>
                                )}
                            </>
                        )}
                    </div>
                </div>
            </div>
        </div>,
        document.body
    );
};
