import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Pencil } from 'lucide-react';
import { type VideoDetails } from '../../../utils/youtubeApi';
import { SidebarVideoPreview } from './SidebarVideoPreview';
import { SidebarNavItem } from './SidebarNavItem';

interface VideoEditSidebarProps {
    video: VideoDetails;
    activeTab: 'packaging';
    onTabChange: (tab: 'packaging') => void;
}

export const VideoEditSidebar: React.FC<VideoEditSidebarProps> = ({
    video,
    activeTab,
    onTabChange,
}) => {
    const navigate = useNavigate();

    return (
        <aside
            className="w-[255px] flex-shrink-0 border-r border-border flex flex-col"
            style={{ backgroundColor: 'var(--video-edit-bg)' }}
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
                <SidebarNavItem
                    icon={<Pencil size={24} />}
                    label="Packaging"
                    isActive={activeTab === 'packaging'}
                    onClick={() => onTabChange('packaging')}
                />
                {/* Future tabs will be added here */}
                {/* <SidebarNavItem icon={<BarChart3 size={24} />} label="Performance" /> */}
                {/* <SidebarNavItem icon={<TrendingUp size={24} />} label="Traffic" /> */}
            </nav>
        </aside>
    );
};
