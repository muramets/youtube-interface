import type { Meta, StoryObj } from '@storybook/react';
import { SortableVariant } from '../SortableVariant';
import { DndContext } from '@dnd-kit/core';
import { SortableContext } from '@dnd-kit/sortable';

const meta = {
    title: 'Video/Modal/SortableVariant',
    component: SortableVariant,
    parameters: {
        layout: 'centered',
    },
    tags: ['autodocs'],
    decorators: [
        (Story) => (
            <DndContext>
                <SortableContext items={['1']}>
                    <div className="w-[150px]">
                        <Story />
                    </div>
                </SortableContext>
            </DndContext>
        ),
    ],
} satisfies Meta<typeof SortableVariant>;

export default meta;
type Story = StoryObj<typeof meta>;

const defaultArgs = {
    id: '1',
    url: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/mqdefault.jpg',
    index: 0,
    onRemove: () => { },
};

export const Default: Story = {
    args: defaultArgs
};

export const SecondItem: Story = {
    args: {
        ...defaultArgs,
        index: 1,
    }
};
