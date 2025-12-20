import type { Meta, StoryObj } from '@storybook/react';
import { ZoomControls } from '../ZoomControls';

const meta = {
    title: 'Video/ZoomControls',
    component: ZoomControls,
    parameters: {
        layout: 'centered',
    },
    tags: ['autodocs'],
} satisfies Meta<typeof ZoomControls>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
    render: () => (
        <div className="relative w-64 h-64 bg-gray-100 dark:bg-gray-800">
            <ZoomControls />
        </div>
    )
};
