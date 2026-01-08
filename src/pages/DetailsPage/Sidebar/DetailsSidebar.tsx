import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { type VideoDetails, type PackagingVersion } from '../../../core/utils/youtubeApi';
import { type TrafficSnapshot } from '../../../core/types/traffic';
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
    hasDraft: boolean;
    onVersionClick: (versionNumber: number | 'draft') => void;
    onDeleteVersion: (versionNumber: number) => void;
    // Traffic props
    snapshots: TrafficSnapshot[];
    selectedSnapshot: string | null;
    onSnapshotClick: (snapshotId: string) => void;
    onDeleteSnapshot?: (snapshotId: string) => void;
    // Tab Navigation
    activeTab: 'packaging' | 'traffic';
    onTabChange: (tab: 'packaging' | 'traffic') => void;
}

export const DetailsSidebar: React.FC<DetailsSidebarProps> = ({
    video,
    versions,
    viewingVersion,
    activeVersion,
    hasDraft,
    onVersionClick,
    onDeleteVersion,
    snapshots,
    selectedSnapshot,
    onSnapshotClick,
    onDeleteSnapshot,
    activeTab,
    onTabChange
}) => {
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
                    onVersionClick={(v) => {
                        onTabChange('packaging');
                        onVersionClick(v);
                    }}
                    onDeleteVersion={onDeleteVersion}
                    isActive={activeTab === 'packaging'}
                    isExpanded={expandedSection === 'packaging'}
                    onToggle={() => handleToggleSection('packaging')}
                    onSelect={() => onTabChange('packaging')}
                />

                <TrafficNav
                    versions={versions}
                    snapshots={snapshots}
                    viewingVersion={viewingVersion}
                    activeVersion={activeVersion}
                    selectedSnapshot={selectedSnapshot}
                    hasDraft={hasDraft}
                    onVersionClick={(v) => {
                        onTabChange('traffic');
                        onVersionClick(v);
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
                />
            </nav>
        </aside>
    );
};
