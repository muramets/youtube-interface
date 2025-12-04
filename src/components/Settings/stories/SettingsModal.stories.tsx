import type { Meta, StoryObj } from '@storybook/react';
import { SettingsModal } from '../SettingsModal';
import { useState } from 'react';

const meta = {
    title: 'Settings/SettingsModal',
    component: SettingsModal,
    parameters: {
        layout: 'centered',
    },
    tags: ['autodocs'],
} satisfies Meta<typeof SettingsModal>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
    args: {
        isOpen: true,
        onClose: () => { },
    },
    render: (args) => {
        const [isOpen, setIsOpen] = useState(false);
        return (
            <div className="h-64 flex items-center justify-center">
                <button
                    onClick={() => setIsOpen(true)}
                    className="bg-gray-200 dark:bg-gray-700 px-4 py-2 rounded text-text-primary"
                >
                    Open Settings
                </button>
                <SettingsModal
                    {...args}
                    isOpen={isOpen}
                    onClose={() => setIsOpen(false)}
                />
            </div>
        )
    }
};
