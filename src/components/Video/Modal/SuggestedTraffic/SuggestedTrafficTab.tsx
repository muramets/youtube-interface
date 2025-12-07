import React, { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { TrafficUploader } from './TrafficUploader';
import { TrafficTable } from './TrafficTable';
import { GroupCreationModal } from './GroupCreationModal';
import { useSuggestedTraffic } from '../../../../hooks/useSuggestedTraffic';
import type { TrafficGroup } from '../../../../types/traffic';
import type { CTRRule } from '../../Packaging/types';
import { TrafficSelectionBar } from './TrafficSelectionBar';
import { SubTabs } from '../../../Shared/SubTabs';
import { usePlaylists } from '../../../../hooks/usePlaylists';
import { useVideos } from '../../../../hooks/useVideos';
import { useAuth } from '../../../../hooks/useAuth';
import { useChannelStore } from '../../../../stores/channelStore';
import { useSettings } from '../../../../hooks/useSettings';
import { fetchVideosBatch } from '../../../../utils/youtubeApi';
import { VideoService } from '../../../../services/videoService';
import { PlaylistService } from '../../../../services/playlistService';

interface SuggestedTrafficTabProps {
    customVideoId: string;
    packagingCtrRules: CTRRule[];
}

export const SuggestedTrafficTab: React.FC<SuggestedTrafficTabProps> = ({ customVideoId, packagingCtrRules }) => {
    const [activeTab, setActiveTab] = useState<string>('all');

    const {
        trafficData,
        totalRow,
        groups,
        isLoading,
        isInitialLoading,
        error,
        selectedIds,
        hideGrouped,
        setHideGrouped,
        handleUpload,
        handleToggleSelection,
        handleToggleAll,
        clearSelection,
        handleCreateGroup,
        handleDeleteGroup,
        handleAddToGroup,
        handleRemoveFromGroup
    } = useSuggestedTraffic(customVideoId, activeTab);

    const { user } = useAuth();
    const { currentChannel } = useChannelStore();
    const { generalSettings } = useSettings();
    const { videos } = useVideos(user?.uid || '', currentChannel?.id || '');
    const { playlists, createPlaylist } = usePlaylists(user?.uid || '', currentChannel?.id || '');

    const [isGroupModalOpen, setIsGroupModalOpen] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);
    const [editingGroup, setEditingGroup] = useState<TrafficGroup | undefined>(undefined);

    // Filter ungrouped data if hideGrouped is true
    const groupedVideoIds = new Set(groups.flatMap(g => g.videoIds));

    // Compute which groups ALL selected videos belong to
    const selectedGroupIds = React.useMemo(() => {
        if (selectedIds.size === 0) return new Set<string>();
        const selectedArray = Array.from(selectedIds);
        // A group is "checked" if ALL selected videos are in that group
        const memberGroups = groups.filter(g =>
            selectedArray.every(vid => g.videoIds.includes(vid))
        );
        return new Set(memberGroups.map(g => g.id));
    }, [selectedIds, groups]);

    // Toggle group membership: add if not all selected are in group, remove if all are
    const handleToggleGroupMembership = (groupId: string) => {
        const selectedArray = Array.from(selectedIds);
        if (selectedGroupIds.has(groupId)) {
            // All selected videos are in this group -> remove them
            handleRemoveFromGroup(groupId, selectedArray);
        } else {
            // Not all selected videos are in this group -> add them
            handleAddToGroup(groupId, selectedArray);
        }
    };

    // Determine data to show based on active tab
    const displayData = React.useMemo(() => {
        if (activeTab === 'all') {
            return hideGrouped
                ? trafficData.filter(item => item.videoId && !groupedVideoIds.has(item.videoId))
                : trafficData;
        }
        const group = groups.find(g => g.id === activeTab);
        if (!group) return [];
        return trafficData.filter(item => item.videoId && group.videoIds.includes(item.videoId));
    }, [activeTab, trafficData, groups, hideGrouped, groupedVideoIds]);



    const handleOpenEditGroup = (group: TrafficGroup) => {
        setEditingGroup(group);
        setIsGroupModalOpen(true);
    };

    const handleSaveGroup = (groupData: Omit<TrafficGroup, 'id' | 'videoIds'> & { id?: string }) => {
        handleCreateGroup(groupData);
    };

    const handleQuickCreateGroup = (name: string) => {
        // Generate a random color
        const colors = ['#EF4444', '#F97316', '#F59E0B', '#10B981', '#06B6D4', '#3B82F6', '#6366F1', '#8B5CF6', '#EC4899'];
        const randomColor = colors[Math.floor(Math.random() * colors.length)];

        handleCreateGroup({ name, color: randomColor });
    };

    const activeGroup = groups.find(g => g.id === activeTab);

    // Show skeleton during initial load for premium experience
    if (isInitialLoading) {
        return (
            <div className="p-6">
                {/* Match TrafficUploader exactly: border border-white/10 rounded-xl p-8 bg-bg-secondary */}
                <div className="relative border border-white/10 rounded-xl p-8 text-center bg-bg-secondary overflow-hidden">
                    {/* Shimmer overlay */}
                    <div className="absolute inset-0 animate-shimmer bg-gradient-to-r from-transparent via-white/5 to-transparent" style={{ backgroundSize: '200% 100%' }} />

                    {/* Content skeleton - matches TrafficUploader layout */}
                    <div className="flex flex-col items-center gap-3">
                        {/* Icon placeholder - w-12 h-12 like TrafficUploader */}
                        <div className="w-12 h-12 rounded-full bg-white/5" />
                        {/* Text placeholders */}
                        <div className="flex flex-col items-center gap-1">
                            <div className="w-36 h-5 rounded bg-white/5" />
                            <div className="w-44 h-4 rounded bg-white/[0.03]" />
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    // Show uploader only after we've confirmed there's no data
    if (trafficData.length === 0 && !isLoading) {
        return (
            <div className="p-6">
                <TrafficUploader onUpload={handleUpload} isLoading={isLoading} error={error} />
            </div>
        );
    }

    return (
        <div className="h-full flex flex-col overflow-hidden relative">
            {/* Tabs */}
            <div className="z-20 bg-bg-secondary flex-shrink-0 border-b border-white/5">
                <SubTabs
                    activeTabId={activeTab}
                    onTabChange={setActiveTab}
                    tabs={[
                        { id: 'all', label: 'All Videos' },
                        ...groups.map(group => ({
                            id: group.id,
                            label: group.name,
                            color: group.color,
                            count: group.videoIds.length
                        }))
                    ]}
                />
            </div>

            <div className="flex-1 flex flex-col min-h-0 px-6 pt-6 pb-6 gap-6">
                {/* Header Actions */}
                <div className="flex items-center justify-between flex-shrink-0">
                    <div className="flex items-center gap-4">
                        <TrafficUploader
                            onUpload={handleUpload}
                            isLoading={isLoading}
                            error={error}
                            isCompact
                        />
                    </div>

                    <div className="flex items-center gap-2">
                        {activeTab === 'all' && (
                            <button
                                onClick={() => setHideGrouped(!hideGrouped)}
                                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${hideGrouped ? 'bg-text-primary text-bg-primary' : 'bg-white/5 text-text-secondary hover:text-white'}`}
                            >
                                {hideGrouped ? <EyeOff size={14} /> : <Eye size={14} />}
                                {hideGrouped ? 'Showing: Unassigned' : 'Showing: All Videos'}
                            </button>
                        )}

                        {activeGroup && (
                            <>
                                <button
                                    onClick={() => handleOpenEditGroup(activeGroup)}
                                    className="px-3 py-1.5 bg-white/5 hover:bg-white/10 text-white text-xs font-medium rounded-lg transition-colors"
                                >
                                    Edit Group
                                </button>
                                <button
                                    onClick={() => {
                                        if (confirm('Are you sure you want to delete this group?')) {
                                            handleDeleteGroup(activeGroup.id);
                                            setActiveTab('all');
                                        }
                                    }}
                                    className="px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-500 text-xs font-medium rounded-lg transition-colors"
                                >
                                    Delete Group
                                </button>
                            </>
                        )}

                    </div>
                </div>

                {/* Main Table */}
                <div className="flex-1 min-h-0">
                    <TrafficTable
                        data={displayData}
                        totalRow={activeTab === 'all' ? totalRow : undefined}
                        selectedIds={selectedIds}
                        onToggleSelection={handleToggleSelection}
                        onToggleAll={handleToggleAll}
                        groups={groups}
                        onAddToGroup={handleAddToGroup}
                        packagingCtrRules={packagingCtrRules}
                    />
                </div>
            </div>

            <TrafficSelectionBar
                selectedCount={selectedIds.size}
                groups={groups}
                selectedGroupIds={selectedGroupIds}
                onAddToGroup={handleToggleGroupMembership}
                onCreateGroup={handleQuickCreateGroup}
                onClearSelection={clearSelection}
                onRemoveFromGroup={activeGroup ? () => {
                    const idsToRemove = Array.from(selectedIds);
                    handleRemoveFromGroup(activeGroup.id, idsToRemove);
                    clearSelection();
                } : undefined}
                activeGroupId={activeGroup?.id}
                isProcessing={isProcessing}
                playlists={playlists}
                onAddToHome={async () => {
                    if (!user || !currentChannel || !generalSettings.apiKey || selectedIds.size === 0) return;
                    setIsProcessing(true);
                    try {
                        const idsToAdd = Array.from(selectedIds);
                        // Filter out empty IDs
                        const validIds = idsToAdd.filter(Boolean);

                        // Batch fetch details
                        const details = await fetchVideosBatch(validIds, generalSettings.apiKey);

                        // Filter out already existing videos
                        const existingIds = new Set(videos.map(v => v.id));
                        const newVideos = details.filter(d => !existingIds.has(d.id));

                        if (newVideos.length === 0) {
                            alert("Selected videos are already in your library.");
                            setIsProcessing(false);
                            return;
                        }

                        // Save new videos
                        await Promise.all(newVideos.map(async (video) => {
                            const videoWithTimestamp = {
                                ...video,
                                createdAt: Date.now(),
                                isPlaylistOnly: false // Explicitly show on home
                            };
                            await VideoService.addVideo(user.uid, currentChannel.id, videoWithTimestamp);
                        }));

                        clearSelection();
                        // Toast handled by subscriber or we could add one here
                    } catch (error) {
                        console.error("Failed to add to home:", error);
                        alert("Failed to add videos. Please check your API key.");
                    } finally {
                        setIsProcessing(false);
                    }
                }}
                onAddToPlaylist={async (playlistId) => {
                    if (!user || !currentChannel || !generalSettings.apiKey || selectedIds.size === 0) return;
                    setIsProcessing(true);
                    try {
                        const idsToAdd = Array.from(selectedIds);
                        const validIds = idsToAdd.filter(Boolean);

                        // 1. Identify which videos are NOT in library yet
                        const existingIds = new Set(videos.map(v => v.id));
                        const missingIds = validIds.filter(id => !existingIds.has(id));

                        // 2. Fetch and save missing videos as PlaylistOnly
                        if (missingIds.length > 0) {
                            const details = await fetchVideosBatch(missingIds, generalSettings.apiKey);
                            await Promise.all(details.map(async (video) => {
                                const videoWithTimestamp = {
                                    ...video,
                                    createdAt: Date.now(),
                                    isPlaylistOnly: true // Hide from Home Page
                                };
                                await VideoService.addVideo(user.uid, currentChannel.id, videoWithTimestamp);
                            }));
                        }

                        // 3. Add ALL selected videos to the playlist
                        await Promise.all(validIds.map(videoId =>
                            PlaylistService.addVideoToPlaylist(user.uid, currentChannel.id, playlistId, videoId)
                        ));

                        clearSelection();
                    } catch (error) {
                        console.error("Failed to add to playlist:", error);
                        alert("Failed to add videos to playlist.");
                    } finally {
                        setIsProcessing(false);
                    }
                }}
                onCreatePlaylist={async (name) => {
                    if (!user || !currentChannel || !generalSettings.apiKey || selectedIds.size === 0) return;
                    setIsProcessing(true);
                    try {
                        // 1. Create Playlist
                        // Note: createPlaylist returns the new ID
                        const newPlaylistId = await createPlaylist({ name, videoIds: [] });

                        // 2. Reuse Add to Playlist logic
                        // We can't directly call the onAddToPlaylist prop function from here since it's defined inline in the render.
                        // So we duplicate the logic or extract it. Duplicating for now since it involves state (isProcessing) which we handle here.

                        const idsToAdd = Array.from(selectedIds);
                        const validIds = idsToAdd.filter(Boolean);

                        // Identify missing videos
                        const existingIds = new Set(videos.map(v => v.id));
                        const missingIds = validIds.filter(id => !existingIds.has(id));

                        // Fetch and save missing videos as PlaylistOnly
                        if (missingIds.length > 0) {
                            const details = await fetchVideosBatch(missingIds, generalSettings.apiKey);
                            await Promise.all(details.map(async (video) => {
                                const videoWithTimestamp = {
                                    ...video,
                                    createdAt: Date.now(),
                                    isPlaylistOnly: true
                                };
                                await VideoService.addVideo(user.uid, currentChannel.id, videoWithTimestamp);
                            }));
                        }

                        // Add ALL selected videos to the NEW playlist
                        await Promise.all(validIds.map(videoId =>
                            PlaylistService.addVideoToPlaylist(user.uid, currentChannel.id, newPlaylistId, videoId)
                        ));

                        clearSelection();
                    } catch (error) {
                        console.error("Failed to create playlist and add videos:", error);
                        alert("Failed to create playlist.");
                    } finally {
                        setIsProcessing(false);
                    }
                }}
            />

            <GroupCreationModal
                isOpen={isGroupModalOpen}
                onClose={() => setIsGroupModalOpen(false)}
                onSave={handleSaveGroup}
                initialData={editingGroup}
            />
        </div>
    );
};
