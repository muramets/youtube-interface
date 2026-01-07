import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, TrendingUp } from 'lucide-react';
import { type VideoDetails, type PackagingVersion } from '../../../core/utils/youtubeApi';
import { SidebarVideoPreview } from './SidebarVideoPreview';
import { SidebarNavItem } from './SidebarNavItem';
import { PackagingNav } from './Packaging/PackagingNav';

interface DetailsSidebarProps {
    video: VideoDetails;
    // Version props
    versions: PackagingVersion[];
    viewingVersion: number | 'draft';
    activeVersion: number | 'draft';  // The version currently used by the video
    hasDraft: boolean;
    onVersionClick: (versionNumber: number | 'draft') => void;
    onDeleteVersion: (versionNumber: number) => void;
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
    activeTab,
    onTabChange
}) => {
    const navigate = useNavigate();
    // Dynamically import icon or assume it's available (Import at top needed)
    // I need to add import for TrendingUp first. Wait, I can't add imports with replace_file_content unless I target the top.
    // I will use a separate call for import or just add it here if I am replacing the whole block?
    // I am replacing the body. I will fix imports in next step or use multi_replace.

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
            <SidebarVideoPreview video={video} />

            {/* Navigation Items */}
            <nav className="flex-1">
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
                    onSelect={() => onTabChange('packaging')}
                />

                <SidebarNavItem
                    icon={<TrendingUp size={24} />}
                    label="Suggested Traffic"
                    isActive={activeTab === 'traffic'}
                    onClick={() => onTabChange('traffic')}
                />
            </nav>
        </aside>
    );
};
