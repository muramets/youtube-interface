import type { Meta, StoryObj } from '@storybook/react';
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '../Tooltip';

const meta = {
    title: 'Shared/Tooltip',
    component: Tooltip,
    parameters: {
        layout: 'centered',
    },
    tags: ['autodocs'],
    decorators: [
        (Story) => (
            <TooltipProvider>
                <div className="p-12">
                    <Story />
                </div>
            </TooltipProvider>
        ),
    ],
} satisfies Meta<typeof Tooltip>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
    render: () => (
        <Tooltip>
            <TooltipTrigger asChild>
                <button className="bg-gray-200 dark:bg-gray-700 px-4 py-2 rounded text-text-primary hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors">
                    Hover me
                </button>
            </TooltipTrigger>
            <TooltipContent>
                <p>This is a tooltip</p>
            </TooltipContent>
        </Tooltip>
    ),
};

export const WithLongContent: Story = {
    render: () => (
        <Tooltip>
            <TooltipTrigger asChild>
                <button className="bg-gray-200 dark:bg-gray-700 px-4 py-2 rounded text-text-primary hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors">
                    Hover for info
                </button>
            </TooltipTrigger>
            <TooltipContent className="max-w-xs">
                <p>This is a tooltip with longer content that might wrap to multiple lines depending on the width constraints.</p>
            </TooltipContent>
        </Tooltip>
    ),
};
