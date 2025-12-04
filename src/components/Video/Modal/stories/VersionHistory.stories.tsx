import type { Meta, StoryObj } from '@storybook/react';
import { VersionHistory } from '../VersionHistory';

const meta = {
    title: 'Video/Modal/VersionHistory',
    component: VersionHistory,
    parameters: {
        layout: 'centered',
    },
    tags: ['autodocs'],
    decorators: [
        (Story) => (
            <div className="w-[352px] bg-modal-surface p-4 rounded-lg">
                <Story />
            </div>
        ),
    ],
} satisfies Meta<typeof VersionHistory>;

export default meta;
type Story = StoryObj<typeof meta>;

const mockHistory = [
    {
        url: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/mqdefault.jpg',
        version: 3,
        timestamp: Date.now(),
        originalName: 'final_v3.jpg'
    },
    {
        url: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/mqdefault.jpg',
        version: 2,
        timestamp: Date.now() - 86400000,
        originalName: 'draft_v2.jpg'
    },
    {
        url: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/mqdefault.jpg',
        version: 1,
        timestamp: Date.now() - 172800000,
        originalName: 'initial.jpg'
    }
];

const defaultArgs = {
    history: mockHistory,
    isLoading: false,
    onRestore: () => { },
    onDelete: (e: React.MouseEvent) => e.stopPropagation(),
    cloningVersion: null,
    currentVersion: 4,
    abTestVariants: [],
    onAddToAbTest: () => { },
};

export const Default: Story = {
    args: defaultArgs
};

export const Loading: Story = {
    args: {
        ...defaultArgs,
        isLoading: true,
        history: []
    }
};

export const Empty: Story = {
    args: {
        ...defaultArgs,
        history: [],
        currentVersion: 1
    }
};

export const EmptyWithDeleted: Story = {
    args: {
        ...defaultArgs,
        history: [],
        currentVersion: 5
    }
};

export const WithABTest: Story = {
    args: {
        ...defaultArgs,
        abTestVariants: ['https://i.ytimg.com/vi/dQw4w9WgXcQ/mqdefault.jpg'],
    }
};
