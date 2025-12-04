import type { Meta, StoryObj } from '@storybook/react';
import { VideoCardSkeleton } from './VideoCardSkeleton';

const meta = {
    title: 'Shared/VideoCardSkeleton',
    component: VideoCardSkeleton,
    parameters: {
        layout: 'centered',
    },
    tags: ['autodocs'],
} satisfies Meta<typeof VideoCardSkeleton>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
    render: () => (
        <div className="w-[300px]">
            <VideoCardSkeleton />
        </div>
    )
};

export const Grid: Story = {
    render: () => (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 w-full max-w-4xl">
            <VideoCardSkeleton />
            <VideoCardSkeleton />
            <VideoCardSkeleton />
            <VideoCardSkeleton />
            <VideoCardSkeleton />
            <VideoCardSkeleton />
        </div>
    )
};
