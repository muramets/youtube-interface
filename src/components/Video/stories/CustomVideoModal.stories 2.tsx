import type { Meta, StoryObj } from '@storybook/react';
import { CustomVideoModal } from '../CustomVideoModal';
import type { VideoDetails } from '../../../utils/youtubeApi';
import { useState } from 'react';

const meta = {
    title: 'Video/CustomVideoModal',
    component: CustomVideoModal,
    parameters: {
        layout: 'centered',
    },
    tags: ['autodocs'],
} satisfies Meta<typeof CustomVideoModal>;

export default meta;
type Story = StoryObj<typeof meta>;

const mockVideo: VideoDetails = {
    id: 'video-1',
    title: 'Sample Video Title',
    thumbnail: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/mqdefault.jpg',
    channelTitle: 'Rick Astley',
    channelId: 'UCuAXFkgsw1L7xaCfnd5JJOw',
    channelAvatar: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/mqdefault.jpg',
    publishedAt: new Date().toISOString(),
    viewCount: '1000000',
    duration: 'PT3M33S',
    isCustom: true,
    description: 'This is a sample description for the video.',
    tags: ['sample', 'video', 'test'],
};

export const CreateMode: Story = {
    args: {
        isOpen: true,
        onClose: () => { },
        onSave: async () => { await new Promise(resolve => setTimeout(resolve, 1000)); },
    },
    render: (args) => {
        const [isOpen, setIsOpen] = useState(false);
        return (
            <div className="h-64 flex items-center justify-center">
                <button
                    onClick={() => setIsOpen(true)}
                    className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
                >
                    Open Create Video Modal
                </button>
                <CustomVideoModal
                    {...args}
                    isOpen={isOpen}
                    onClose={() => setIsOpen(false)}
                />
            </div>
        )
    }
};

export const EditMode: Story = {
    args: {
        ...CreateMode.args,
        initialData: mockVideo,
    },
    render: (args) => {
        const [isOpen, setIsOpen] = useState(false);
        return (
            <div className="h-64 flex items-center justify-center">
                <button
                    onClick={() => setIsOpen(true)}
                    className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700"
                >
                    Open Edit Video Modal
                </button>
                <CustomVideoModal
                    {...args}
                    isOpen={isOpen}
                    onClose={() => setIsOpen(false)}
                />
            </div>
        )
    }
};

export const WithPackagingHistory: Story = {
    args: {
        ...CreateMode.args,
        initialData: {
            ...mockVideo,
            coverHistory: [
                {
                    url: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/mqdefault.jpg',
                    version: 2,
                    timestamp: Date.now() - 86400000,
                    originalName: 'v2.jpg'
                },
                {
                    url: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/mqdefault.jpg',
                    version: 1,
                    timestamp: Date.now() - 172800000,
                    originalName: 'v1.jpg'
                }
            ],
            highestVersion: 2,
            customImageVersion: 3
        },
    },
    render: EditMode.render
};

