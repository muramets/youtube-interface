import React from 'react';
import { ZoomControls } from './ZoomControls';
import { GRID_LAYOUT } from '../../config/layout';

interface VideoGridContainerProps {
    children: React.ReactNode;
}

export const VideoGridContainer: React.FC<VideoGridContainerProps> = ({ children }) => {
    return (
        <div
            className="flex-1 min-h-0 relative h-full w-full box-border"
            style={{ paddingTop: GRID_LAYOUT.PADDING.TOP }}
        >
            {children}
            <ZoomControls />
        </div>
    );
};
