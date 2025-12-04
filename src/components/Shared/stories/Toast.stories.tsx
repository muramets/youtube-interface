import type { Meta, StoryObj } from '@storybook/react';
import { Toast } from '../Toast';
import { useState } from 'react';

const meta = {
    title: 'Shared/Toast',
    component: Toast,
    parameters: {
        layout: 'centered',
    },
    tags: ['autodocs'],
    argTypes: {
        type: { control: 'select', options: ['success', 'error'] },
        position: { control: 'select', options: ['top', 'bottom'] },
    },
} satisfies Meta<typeof Toast>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
    args: {
        message: 'Operation successful',
        isVisible: true,
        duration: 3000,
        type: 'success',
        position: 'bottom',
        onClose: () => { },
    },
    render: (args) => {
        const [isVisible, setIsVisible] = useState(false);

        return (
            <div className="h-64 flex items-center justify-center">
                <button
                    onClick={() => setIsVisible(true)}
                    className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition-colors"
                >
                    Show Toast
                </button>
                <Toast
                    {...args}
                    isVisible={isVisible}
                    onClose={() => setIsVisible(false)}
                />
            </div>
        );
    }
};

export const Error: Story = {
    args: {
        ...Default.args,
        message: 'Something went wrong',
        type: 'error',
    },
    render: Default.render
};

export const TopPosition: Story = {
    args: {
        ...Default.args,
        position: 'top',
        message: 'Toast from the top',
    },
    render: Default.render
};
