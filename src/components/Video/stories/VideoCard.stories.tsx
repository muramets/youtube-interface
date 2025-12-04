import type { Meta, StoryObj } from '@storybook/react';
import { VideoCard } from '../VideoCard';
import type { VideoDetails } from '../../../utils/youtubeApi';

const meta = {
    title: 'Video/VideoCard',
    component: VideoCard,
    parameters: {
        layout: 'centered',
    },
    tags: ['autodocs'],
} satisfies Meta<typeof VideoCard>;

export default meta;
type Story = StoryObj<typeof meta>;

const mockVideo: VideoDetails = {
    id: 'video-1',
    title: 'Sample Video Title That Is Quite Long To Test Truncation',
    thumbnail: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/mqdefault.jpg',
    channelTitle: 'Rick Astley',
    channelId: 'UCuAXFkgsw1L7xaCfnd5JJOw',
    channelAvatar: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/mqdefault.jpg',
    publishedAt: new Date().toISOString(),
    viewCount: '1000000',
    duration: 'PT3M33S',
    isCustom: false,
    isCloned: false,
};

const mockCustomVideo: VideoDetails = {
    ...mockVideo,
    id: 'custom-1',
    title: 'My Custom Video',
    isCustom: true,
    channelTitle: 'My Channel',
};

const mockClonedVideo: VideoDetails = {
    ...mockVideo,
    id: 'cloned-1',
    title: 'Cloned Video',
    isCloned: true,
    expiresAt: Date.now() + 3600000, // 1 hour from now
};

export const Default: Story = {
    args: {
        video: mockVideo,
        onRemove: () => { },
        onEdit: () => { },
    },
    render: (args) => (
        <div className="w-[300px]">
            <VideoCard {...args} />
        </div>
    )
};

export const Custom: Story = {
    args: {
        ...Default.args,
        video: mockCustomVideo,
    },
    render: Default.render
};

export const Cloned: Story = {
    args: {
        ...Default.args,
        video: mockClonedVideo,
    },
    render: Default.render
};
