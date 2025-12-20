import React, { useState } from 'react';
import { type VideoDetails } from '../../utils/youtubeApi';
import { VideoEditSidebar } from './Sidebar/VideoEditSidebar';
import { PackagingTab } from './PackagingTab/PackagingTab';

interface VideoEditLayoutProps {
    video: VideoDetails;
}

export const VideoEditLayout: React.FC<VideoEditLayoutProps> = ({ video }) => {
    const [activeTab, setActiveTab] = useState<'packaging'>('packaging');

    return (
        <div className="flex-1 flex overflow-hidden" style={{ backgroundColor: 'var(--video-edit-bg)' }}>
            {/* Left Sidebar */}
            <VideoEditSidebar
                video={video}
                activeTab={activeTab}
                onTabChange={setActiveTab}
            />

            {/* Main Content Area */}
            <div className="flex-1 overflow-y-auto">
                {activeTab === 'packaging' && <PackagingTab video={video} />}
            </div>
        </div>
    );
};
