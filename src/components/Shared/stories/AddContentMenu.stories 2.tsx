import type { Meta, StoryObj } from '@storybook/react';
import { AddContentMenu } from '../AddContentMenu';

const meta = {
    title: 'Shared/AddContentMenu',
    component: AddContentMenu,
    parameters: {
        layout: 'centered',
    },
    tags: ['autodocs'],
} satisfies Meta<typeof AddContentMenu>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
    args: {
        showVideo: true,
        showPlaylist: true,
        directPlaylist: false,
    },
};

export const PlaylistOnly: Story = {
    args: {
        showVideo: false,
        showPlaylist: true,
        directPlaylist: true,
    }
};

export const VideoOnly: Story = {
    args: {
        showVideo: true,
        showPlaylist: false,
    }
};
