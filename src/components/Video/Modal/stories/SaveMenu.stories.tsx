import type { Meta, StoryObj } from '@storybook/react';
import { SaveMenu } from '../SaveMenu';

const meta = {
    title: 'Video/Modal/SaveMenu',
    component: SaveMenu,
    parameters: {
        layout: 'centered',
    },
    tags: ['autodocs'],
    decorators: [
        (Story) => (
            <div className="p-10 bg-bg-secondary rounded-xl">
                <Story />
            </div>
        ),
    ],
} satisfies Meta<typeof SaveMenu>;

export default meta;
type Story = StoryObj<typeof meta>;

const defaultArgs = {
    isSaving: false,
    isPackagingDirty: false,
    isDraft: true,
    hasCoverImage: true,
    currentPackagingVersion: 1,
    onSaveDraft: () => { },
    onSaveVersion: () => { },
};

export const Default: Story = {
    args: defaultArgs
};

export const Saving: Story = {
    args: {
        ...defaultArgs,
        isSaving: true
    }
};

export const DirtyPackaging: Story = {
    args: {
        ...defaultArgs,
        isPackagingDirty: true
    }
};

export const NotDraft: Story = {
    args: {
        ...defaultArgs,
        isDraft: false
    }
};

export const NoCoverImage: Story = {
    args: {
        ...defaultArgs,
        hasCoverImage: false
    }
};
