import type { Meta, StoryObj } from '@storybook/react';
import { Sidebar } from '../Sidebar';

const meta = {
    title: 'Layout/Sidebar',
    component: Sidebar,
    parameters: {
        layout: 'fullscreen',
    },
    tags: ['autodocs'],
} satisfies Meta<typeof Sidebar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
    render: () => (
        <div className="flex h-screen bg-bg-primary">
            <Sidebar />
            <div className="flex-1 p-4">
                <h1 className="text-2xl font-bold">Main Content</h1>
                <p>The sidebar should be visible on the left.</p>
            </div>
        </div>
    )
};
