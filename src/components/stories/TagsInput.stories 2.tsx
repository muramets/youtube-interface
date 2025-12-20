import type { Meta, StoryObj } from '@storybook/react';
import { TagsInput } from '../TagsInput';
import { useState } from 'react';

const meta = {
    title: 'Components/TagsInput',
    component: TagsInput,
    parameters: {
        layout: 'centered',
    },
    tags: ['autodocs'],
    decorators: [
        (Story) => (
            <div className="w-[400px] bg-bg-secondary p-4 rounded-xl">
                <Story />
            </div>
        ),
    ],
} satisfies Meta<typeof TagsInput>;

export default meta;
type Story = StoryObj<typeof meta>;

const defaultArgs = {
    tags: [],
    onChange: () => { },
    onShowToast: () => { },
};

export const Default: Story = {
    args: defaultArgs,
    render: (args) => {
        const [tags, setTags] = useState(args.tags);
        return <TagsInput {...args} tags={tags} onChange={setTags} />;
    }
};

export const WithTags: Story = {
    args: {
        ...defaultArgs,
        tags: ['react', 'typescript', 'storybook'],
    },
    render: Default.render
};

export const MaxTags: Story = {
    args: {
        ...defaultArgs,
        tags: Array.from({ length: 15 }, (_, i) => `tag-${i}`),
    },
    render: Default.render
};
