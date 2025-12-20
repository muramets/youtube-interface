import type { Meta, StoryObj } from '@storybook/react';
import { CategoryBar } from '../CategoryBar';

const meta = {
    title: 'Video/CategoryBar',
    component: CategoryBar,
    parameters: {
        layout: 'fullscreen',
    },
    tags: ['autodocs'],
} satisfies Meta<typeof CategoryBar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
    render: () => (
        <div className="w-full bg-bg-primary">
            <CategoryBar />
        </div>
    )
};
