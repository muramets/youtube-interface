import type { Meta, StoryObj } from '@storybook/react';
import { MetricsModal } from '../MetricsModal';

const meta = {
    title: 'Video/Modal/MetricsModal',
    component: MetricsModal,
    parameters: {
        layout: 'centered',
    },
    tags: ['autodocs'],
    decorators: [
        (Story) => (
            <div className="h-[400px] w-[600px] relative">
                <Story />
            </div>
        ),
    ],
} satisfies Meta<typeof MetricsModal>;

export default meta;
type Story = StoryObj<typeof meta>;

const defaultArgs = {
    isOpen: true,
    onClose: () => { },
    onConfirm: () => { },
    checkinTargetVersion: null,
    currentPackagingVersion: 1,
};

export const Default: Story = {
    args: defaultArgs
};

export const AddCheckin: Story = {
    args: {
        ...defaultArgs,
        checkinTargetVersion: 1,
    }
};

export const HighVersion: Story = {
    args: {
        ...defaultArgs,
        currentPackagingVersion: 10,
    }
};
