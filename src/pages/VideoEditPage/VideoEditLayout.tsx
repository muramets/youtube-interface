import React, { useState } from 'react';
import { type VideoDetails } from '../../utils/youtubeApi';
import { VideoEditSidebar } from './Sidebar/VideoEditSidebar';
import { DetailsTab } from './DetailsTab/DetailsTab';

interface VideoEditLayoutProps {
    video: VideoDetails;
}

export const VideoEditLayout: React.FC<VideoEditLayoutProps> = ({ video }) => {
    const [activeTab, setActiveTab] = useState<'details'>('details');

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
                {activeTab === 'details' && <DetailsTab video={video} />}
            </div>
        </div>
    );
};
