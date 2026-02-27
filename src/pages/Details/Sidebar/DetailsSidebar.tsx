import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Clapperboard } from 'lucide-react';
import { type VideoDetails, type PackagingVersion } from '../../../core/utils/youtubeApi';
import { type TrafficSnapshot, type TrafficGroup, type TrafficSource } from '../../../core/types/traffic';
import type { GallerySource } from '../../../core/types/gallery';
import { SidebarVideoPreview } from './SidebarVideoPreview';
import { SidebarNavItem } from './SidebarNavItem';
import { PackagingNav } from './Packaging/PackagingNav';
import { TrafficNav } from './Traffic/TrafficNav';
import { GalleryNav } from './Gallery/GalleryNav';

import { useAuth } from '../../../core/hooks/useAuth';
import { useChannelStore } from '../../../core/stores/channelStore';
import { usePlaylists } from '../../../core/hooks/usePlaylists';

interface DetailsSidebarProps {
    video: VideoDetails;
    // Version props
    versions: PackagingVersion[];
    viewingVersion: number | 'draft';
    activeVersion: number | 'draft';  // The version currently used by the video
    hasDraft: boolean;
    onVersionClick: (versionNumber: number | 'draft', periodIndex?: number) => void;
    onDeleteVersion: (versionNumber: number, versionLabel?: string) => void;
    onDeleteDraft?: () => void;
    // Traffic props
    snapshots: TrafficSnapshot[];
    selectedSnapshot: string | null;
    onSnapshotClick: (snapshotId: string) => void;
    onDeleteSnapshot?: (snapshotId: string) => void;
    onUpdateSnapshotMetadata?: (snapshotId: string, metadata: { label?: string; activeDate?: { start: number; end: number } | null }) => void;
    onReassignVersion?: (snapshotId: string, newVersion: number) => void;
    // Niche Data (Calculated in Layout)
    groups: TrafficGroup[];
    displayedSources: TrafficSource[];
    // Filter Control
    onAddFilter?: (filter: Omit<import('../../../core/types/traffic').TrafficFilter, 'id'>) => void;
    // Tab Navigation
    activeTab: 'packaging' | 'traffic' | 'gallery' | 'editing';
    onTabChange: (tab: 'packaging' | 'traffic' | 'gallery' | 'editing') => void;
    activeNicheId?: string | null;
    playlistId?: string;
    // Gallery Sources props
    gallerySources: GallerySource[];
    activeSourceId: string | null;
    onSourceClick: (sourceId: string | null) => void;
    onAddSource: () => void;
    onDeleteSource: (sourceId: string) => void;
    onUpdateSource: (sourceId: string, data: { type?: import('../../../core/types/gallery').GallerySourceType; label?: string; url?: string }) => void;
}

export const DetailsSidebar = React.memo<DetailsSidebarProps>(({
    video,
    versions,
    viewingVersion,
    activeVersion,
    hasDraft,
    onVersionClick,
    onDeleteVersion,
    onDeleteDraft,
    snapshots,
    selectedSnapshot,
    onSnapshotClick,
    onDeleteSnapshot,
    onUpdateSnapshotMetadata,
    onReassignVersion,
    groups,
    displayedSources,
    onAddFilter,
    activeTab,
    onTabChange,
    activeNicheId,
    playlistId,
    gallerySources,
    activeSourceId,
    onSourceClick,
    onAddSource,
    onDeleteSource,
    onUpdateSource
}) => {
    // DEBUG: Identify changed props causing re-renders
    // (Removed debug logs)

    const { user } = useAuth();
    const { currentChannel } = useChannelStore();
    const { playlists } = usePlaylists(user?.uid || '', currentChannel?.id || '');

    const activePlaylist = React.useMemo(() => {
        if (!playlistId) return null;
        return playlists.find(p => p.id === playlistId);
    }, [playlists, playlistId]);

    // ...

    const navigate = useNavigate();

    // UI STATE: Mutual Exclusivity for Sidebar Sections
    // ============================================================================
    // Only one section (Packaging, Traffic, or Gallery) can be expanded at a time.
    // By default, the active tab's section is expanded.
    const [expandedSection, setExpandedSection] = React.useState<'packaging' | 'traffic' | 'gallery' | 'editing' | null>(activeTab);

    // Render-phase state update to prevent flickering (double render)
    const [prevActiveTab, setPrevActiveTab] = React.useState(activeTab);
    if (activeTab !== prevActiveTab) {
        setPrevActiveTab(activeTab);
        setExpandedSection(activeTab);
    }

    const handleToggleSection = (section: 'packaging' | 'traffic' | 'gallery' | 'editing') => {
        setExpandedSection(prev => prev === section ? null : section);
    };

    const handleNicheClick = (nicheId: string) => {
        if (onAddFilter && groups) {
            // Find niche name for label
            const niche = groups.find(g => g.id === nicheId);
            const label = niche ? `Niche: ${niche.name}` : 'Niche Filter';

            onAddFilter({
                type: 'niche',
                operator: 'contains',
                value: [nicheId], // Exclusive selection
                label
            });

            // Ensure we are viewing the Traffic tab
            if (activeTab !== 'traffic') {
                onTabChange('traffic');
            }
        }
    };

    return (
        <aside
            className="w-[255px] flex-shrink-0 border-r border-border flex flex-col bg-video-edit-bg"
        >
            {/* Back Button - Context Aware */}
            <div className="py-2">
                <SidebarNavItem
                    icon={<ArrowLeft size={24} />}
                    label={activePlaylist ? activePlaylist.name : "Home"}
                    onClick={
                        activePlaylist
                            ? () => navigate(`/playlists/${activePlaylist.id}`)
                            : () => navigate('/')
                    }
                />
            </div>

            {/* Video Preview Section */}
            <SidebarVideoPreview
                video={video}
                viewingVersion={viewingVersion}
                versions={versions}
            />

            {/* Navigation Items */}
            <nav className="flex-1 overflow-y-auto no-scrollbar">
                <PackagingNav
                    versions={versions}
                    viewingVersion={viewingVersion}
                    activeVersion={activeVersion}
                    hasDraft={hasDraft}
                    onVersionClick={(v: number | 'draft', p?: number) => {
                        onTabChange('packaging');
                        onVersionClick(v, p);
                    }}
                    onDeleteVersion={onDeleteVersion}
                    onDeleteDraft={onDeleteDraft}
                    isActive={activeTab === 'packaging'}
                    isExpanded={expandedSection === 'packaging'}
                    onToggle={() => handleToggleSection('packaging')}
                    onSelect={() => onTabChange('packaging')}
                />

                {/* Traffic Nav - only for custom videos (hide for YouTube videos) */}
                {video.id.startsWith('custom-') && (
                    <TrafficNav
                        versions={versions}
                        snapshots={snapshots}
                        groups={groups}
                        displayedSources={displayedSources}
                        viewingVersion={viewingVersion}
                        activeVersion={activeVersion}
                        selectedSnapshot={selectedSnapshot}
                        publishDate={video.publishedAt ? new Date(video.publishedAt).getTime() : undefined}
                        onVersionClick={(v: number | 'draft') => {
                            onTabChange('traffic');
                            onVersionClick(v);
                        }}
                        onSnapshotClick={(snapshotId) => {
                            onTabChange('traffic');
                            onSnapshotClick(snapshotId);
                        }}
                        onDeleteSnapshot={onDeleteSnapshot}
                        onUpdateSnapshotMetadata={onUpdateSnapshotMetadata}
                        onReassignVersion={onReassignVersion}
                        isActive={activeTab === 'traffic'}
                        isExpanded={expandedSection === 'traffic'}
                        onToggle={() => handleToggleSection('traffic')}
                        onSelect={() => onTabChange('traffic')}
                        onNicheClick={handleNicheClick}
                        activeNicheId={activeNicheId || null}
                    />
                )}

                <GalleryNav
                    itemCount={video.galleryItems?.length || 0}
                    sources={gallerySources}
                    activeSourceId={activeSourceId}
                    isActive={activeTab === 'gallery'}
                    isExpanded={expandedSection === 'gallery'}
                    onToggle={() => handleToggleSection('gallery')}
                    onSelect={() => onTabChange('gallery')}
                    onSourceClick={onSourceClick}
                    onAddSource={onAddSource}
                    onDeleteSource={onDeleteSource}
                    onUpdateSource={onUpdateSource}
                />

                <SidebarNavItem
                    icon={<Clapperboard size={24} />}
                    label="Editing"
                    isActive={activeTab === 'editing'}
                    onClick={() => onTabChange('editing')}
                />
            </nav>
        </aside>
    );
});
