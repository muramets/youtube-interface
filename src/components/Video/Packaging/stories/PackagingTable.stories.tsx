import type { Meta, StoryObj } from '@storybook/react';
import { PackagingTable } from '../index';

const meta = {
    title: 'Video/Packaging/PackagingTable',
    component: PackagingTable,
    parameters: {
        layout: 'centered',
    },
    tags: ['autodocs'],
    decorators: [
        (Story) => (
            <div className="w-[800px] bg-bg-secondary p-4 rounded-xl">
                <Story />
            </div>
        ),
    ],
} satisfies Meta<typeof PackagingTable>;

export default meta;
type Story = StoryObj<typeof meta>;

const mockHistory = [
    {
        versionNumber: 2,
        startDate: Date.now(),
        checkins: [
            {
                id: 'c2',
                date: Date.now(),
                metrics: {
                    impressions: 1500,
                    ctr: 5.2,
                    views: 78,
                    avdSeconds: 120,
                    avdPercentage: 45
                }
            }
        ],
        configurationSnapshot: {
            title: 'Version 2 Title',
            description: 'Desc',
            tags: [],
            coverImage: '',
            abTestVariants: [],
            localizations: {}
        }
    },
    {
        versionNumber: 1,
        startDate: Date.now() - 86400000,
        checkins: [
            {
                id: 'c1-2',
                date: Date.now() - 43200000,
                metrics: {
                    impressions: 1000,
                    ctr: 4.5,
                    views: 45,
                    avdSeconds: 100,
                    avdPercentage: 40
                }
            },
            {
                id: 'c1-1',
                date: Date.now() - 86400000,
                metrics: {
                    impressions: 500,
                    ctr: 4.0,
                    views: 20,
                    avdSeconds: 90,
                    avdPercentage: 35
                }
            }
        ],
        configurationSnapshot: {
            title: 'Version 1 Title',
            description: 'Desc',
            tags: [],
            coverImage: '',
            abTestVariants: [],
            localizations: {}
        }
    }
];

const defaultArgs = {
    history: mockHistory,
    onUpdateHistory: () => { },
    onAddCheckin: () => { },
};

export const Default: Story = {
    args: defaultArgs
};

export const Empty: Story = {
    args: {
        ...defaultArgs,
        history: []
    }
};

export const SingleVersion: Story = {
    args: {
        ...defaultArgs,
        history: [mockHistory[0]]
    }
};
