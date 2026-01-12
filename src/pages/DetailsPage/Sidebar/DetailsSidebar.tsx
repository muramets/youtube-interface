import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { type VideoDetails, type PackagingVersion } from '../../../core/utils/youtubeApi';
import { type TrafficSnapshot, type TrafficGroup, type TrafficSource } from '../../../core/types/traffic';
import { SidebarVideoPreview } from './SidebarVideoPreview';
import { SidebarNavItem } from './SidebarNavItem';
import { PackagingNav } from './Packaging/PackagingNav';
import { TrafficNav } from './Traffic/TrafficNav';

interface DetailsSidebarProps {
    video: VideoDetails;
    // Version props
    versions: PackagingVersion[];
    viewingVersion: number | 'draft';
    activeVersion: number | 'draft';  // The version currently used by the video
    viewingPeriodIndex?: number;
    hasDraft: boolean;
    onVersionClick: (versionNumber: number | 'draft', periodIndex?: number) => void;
    onDeleteVersion: (versionNumber: number, versionLabel?: string) => void;
    onDeleteDraft?: () => void;
    // Traffic props
    snapshots: TrafficSnapshot[];
    selectedSnapshot: string | null;
    onSnapshotClick: (snapshotId: string) => void;
    onDeleteSnapshot?: (snapshotId: string) => void;
    // Niche Data (Calculated in Layout)
    groups: TrafficGroup[];
    displayedSources: TrafficSource[];
    // Filter Control
    onAddFilter?: (filter: Omit<import('../../../core/types/traffic').TrafficFilter, 'id'>) => void;
    // Tab Navigation
    activeTab: 'packaging' | 'traffic';
    onTabChange: (tab: 'packaging' | 'traffic') => void;
    activeNicheId?: string | null;
}

export const DetailsSidebar: React.FC<DetailsSidebarProps> = ({
    video,
    versions,
    viewingVersion,
    activeVersion,
    viewingPeriodIndex,
    hasDraft,
    onVersionClick,
    onDeleteVersion,
    onDeleteDraft,
    snapshots,
    selectedSnapshot,
    onSnapshotClick,
    onDeleteSnapshot,
    groups,
    displayedSources,
    onAddFilter,
    activeTab,
    onTabChange,
    activeNicheId
}) => {
    // ... (rest is same until TrafficNav)

    // ...

    const navigate = useNavigate();

    // ============================================================================
    // UI STATE: Mutual Exclusivity for Sidebar Sections
    // ============================================================================
    // Only one section (Packaging or Traffic) can be expanded at a time.
    // By default, the active tab's section is expanded.
    const [expandedSection, setExpandedSection] = React.useState<'packaging' | 'traffic' | null>(activeTab);

    // Update expansion when active tab changes (e.g. from external source)
    React.useEffect(() => {
        setExpandedSection(activeTab);
    }, [activeTab]);

    const handleToggleSection = (section: 'packaging' | 'traffic') => {
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
            {/* Back Button - uses same styling as nav items */}
            <div className="py-2">
                <SidebarNavItem
                    icon={<ArrowLeft size={24} />}
                    label="Home"
                    onClick={() => navigate('/')}
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

                <TrafficNav
                    versions={versions}
                    snapshots={snapshots}
                    groups={groups}
                    displayedSources={displayedSources}
                    viewingVersion={viewingVersion}
                    viewingPeriodIndex={viewingPeriodIndex}
                    activeVersion={activeVersion}
                    selectedSnapshot={selectedSnapshot}
                    isVideoPublished={!!video.publishedVideoId}
                    onVersionClick={(v: number | 'draft', p?: number) => {
                        onTabChange('traffic');
                        onVersionClick(v, p);
                    }}
                    onSnapshotClick={(snapshotId) => {
                        onTabChange('traffic');
                        onSnapshotClick(snapshotId);
                    }}
                    onDeleteSnapshot={onDeleteSnapshot}
                    isActive={activeTab === 'traffic'}
                    isExpanded={expandedSection === 'traffic'}
                    onToggle={() => handleToggleSection('traffic')}
                    onSelect={() => onTabChange('traffic')}
                    onNicheClick={handleNicheClick}
                    activeNicheId={activeNicheId || null}
                />
            </nav>
        </aside>
    );
};
