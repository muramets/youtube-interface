import type { Meta, StoryObj } from '@storybook/react';
import { ImageUploader } from '../ImageUploader';
import { useRef } from 'react';

const meta = {
    title: 'Video/Modal/ImageUploader',
    component: ImageUploader,
    parameters: {
        layout: 'centered',
    },
    tags: ['autodocs'],
    decorators: [
        (Story) => (
            <div className="w-[352px] bg-modal-surface rounded-xl shadow-lg overflow-hidden">
                <Story />
            </div>
        ),
    ],
} satisfies Meta<typeof ImageUploader>;

export default meta;
type Story = StoryObj<typeof meta>;

const defaultArgs = {
    coverImage: null,
    onUpload: () => { },
    onDrop: (e: React.DragEvent) => e.preventDefault(),
    onTriggerUpload: () => { },
    currentVersion: 1,
    currentOriginalName: 'image.jpg',
    onDelete: (e: React.MouseEvent) => e.stopPropagation(),
    abTestVariants: [],
    onAddToAbTest: () => { },
    fileInputRef: { current: null },
};

export const Empty: Story = {
    args: defaultArgs,
    render: (args) => {
        const fileInputRef = useRef<HTMLInputElement>(null);
        return <ImageUploader {...args} fileInputRef={fileInputRef} />;
    }
};

export const WithImage: Story = {
    args: {
        ...defaultArgs,
        coverImage: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/mqdefault.jpg',
        currentOriginalName: 'rick_roll.jpg',
        currentVersion: 5,
    },
    render: (args) => {
        const fileInputRef = useRef<HTMLInputElement>(null);
        return <ImageUploader {...args} fileInputRef={fileInputRef} />;
    }
};
