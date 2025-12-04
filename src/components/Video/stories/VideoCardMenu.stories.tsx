import type { Meta, StoryObj } from '@storybook/react';
import { VideoCardMenu } from '../VideoCardMenu';
import { useState, useRef } from 'react';

const meta = {
    title: 'Video/VideoCardMenu',
    component: VideoCardMenu,
    parameters: {
        layout: 'centered',
    },
    tags: ['autodocs'],
} satisfies Meta<typeof VideoCardMenu>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
    args: {
        isOpen: true,
        onClose: () => { },
        anchorEl: null,
        onAddToPlaylist: () => { },
        onEdit: () => { },
        onRemove: () => { },
        onDelete: () => { },
        isCustom: false,
    },
    render: (args) => {
        const [isOpen, setIsOpen] = useState(false);
        const buttonRef = useRef<HTMLButtonElement>(null);

        return (
            <div className="h-64 flex items-center justify-center">
                <button
                    ref={buttonRef}
                    onClick={() => setIsOpen(!isOpen)}
                    className="bg-gray-200 dark:bg-gray-700 px-4 py-2 rounded text-text-primary"
                >
                    Open Menu
                </button>
                <VideoCardMenu
                    {...args}
                    isOpen={isOpen}
                    onClose={() => setIsOpen(false)}
                    anchorEl={buttonRef.current}
                />
            </div>
        )
    }
};

export const CustomVideo: Story = {
    args: {
        ...Default.args,
        isCustom: true,
    },
    render: Default.render
};

export const WithSync: Story = {
    args: {
        ...Default.args,
        onSync: () => { },
        isSyncing: false,
    },
    render: Default.render
};

export const InPlaylist: Story = {
    args: {
        ...Default.args,
        playlistId: 'some-playlist-id',
    },
    render: Default.render
};
