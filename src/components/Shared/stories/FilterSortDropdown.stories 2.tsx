import type { Meta, StoryObj } from '@storybook/react';
import { FilterSortDropdown } from '../FilterSortDropdown';
import { useState } from 'react';

const meta = {
    title: 'Shared/FilterSortDropdown',
    component: FilterSortDropdown,
    parameters: {
        layout: 'centered',
    },
    tags: ['autodocs'],
} satisfies Meta<typeof FilterSortDropdown>;

export default meta;
type Story = StoryObj<typeof meta>;

const sortOptions = [
    { label: 'Default (Manual)', value: 'default' },
    { label: 'Most Viewed', value: 'views' },
    { label: 'Newest First', value: 'date' },
];

export const Default: Story = {
    args: {
        sortOptions,
        activeSort: 'default',
        onSortChange: () => { },
        showPlaylistFilter: true,
    },
    render: (args) => {
        const [activeSort, setActiveSort] = useState('default');
        return (
            <div className="h-64 flex items-center justify-center">
                <FilterSortDropdown
                    {...args}
                    activeSort={activeSort}
                    onSortChange={setActiveSort}
                />
            </div>
        )
    }
};
