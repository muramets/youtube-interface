import type { Meta, StoryObj } from '@storybook/react';
import { ConfirmationModal } from '../ConfirmationModal';
import { useState } from 'react';

const meta = {
    title: 'Shared/ConfirmationModal',
    component: ConfirmationModal,
    parameters: {
        layout: 'centered',
    },
    tags: ['autodocs'],
} satisfies Meta<typeof ConfirmationModal>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
    args: {
        isOpen: true,
        title: 'Delete Item',
        message: 'Are you sure you want to delete this item? This action cannot be undone.',
        confirmLabel: 'Delete',
        cancelLabel: 'Cancel',
        onClose: () => { },
        onConfirm: () => { },
    },
    render: (args) => {
        const [isOpen, setIsOpen] = useState(false);
        return (
            <div className="h-64 flex items-center justify-center">
                <button onClick={() => setIsOpen(true)} className="bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700 transition-colors">Delete Item</button>
                <ConfirmationModal
                    {...args}
                    isOpen={isOpen}
                    onClose={() => setIsOpen(false)}
                    onConfirm={() => {
                        setIsOpen(false);
                    }}
                />
            </div>
        )
    }
};

export const CustomLabels: Story = {
    args: {
        ...Default.args,
        title: 'Save Changes',
        message: 'Do you want to save your changes before leaving?',
        confirmLabel: 'Save',
        cancelLabel: 'Discard',
    },
    render: Default.render
};
