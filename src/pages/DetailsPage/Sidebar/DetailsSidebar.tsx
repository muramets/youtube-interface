import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
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
}

export const DetailsSidebar: React.FC<DetailsSidebarProps> = ({
    video,
    versions,
    viewingVersion,
    activeVersion,
    hasDraft,
    onVersionClick,
    onDeleteVersion,
}) => {
    const navigate = useNavigate();

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
                    onVersionClick={onVersionClick}
                    onDeleteVersion={onDeleteVersion}
                />
                {/* Future tabs will be added here */}
                {/* <SidebarNavItem icon={<BarChart3 size={24} />} label="Performance" /> */}
                {/* <SidebarNavItem icon={<TrendingUp size={24} />} label="Traffic" /> */}
            </nav>
        </aside>
    );
};
