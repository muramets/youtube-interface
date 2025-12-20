import type { Meta, StoryObj } from '@storybook/react';
import { Dropdown } from '../Dropdown';
import { useState, useRef } from 'react';

const meta = {
    title: 'Shared/Dropdown',
    component: Dropdown,
    parameters: {
        layout: 'centered',
    },
    tags: ['autodocs'],
} satisfies Meta<typeof Dropdown>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
    args: {
        isOpen: true,
        onClose: () => { },
        anchorEl: null,
        children: <div className="p-4">Dropdown Content</div>,
    },
    render: (args) => {
        const [isOpen, setIsOpen] = useState(false);
        const buttonRef = useRef<HTMLButtonElement>(null);

        return (
            <div className="h-64 flex items-center justify-center">
                <button
                    ref={buttonRef}
                    onClick={() => setIsOpen(!isOpen)}
                    className="bg-gray-200 dark:bg-gray-700 px-4 py-2 rounded text-text-primary"
                >
                    Toggle Dropdown
                </button>
                <Dropdown
                    {...args}
                    isOpen={isOpen}
                    onClose={() => setIsOpen(false)}
                    anchorEl={buttonRef.current}
                >
                    <div className="p-4 w-full">
                        <h3 className="font-bold mb-2">Dropdown Title</h3>
                        <p className="text-sm text-gray-500">Some content inside the dropdown.</p>
                        <button className="mt-2 w-full bg-blue-500 text-white py-1 rounded">Action</button>
                    </div>
                </Dropdown>
            </div>
        )
    }
};
