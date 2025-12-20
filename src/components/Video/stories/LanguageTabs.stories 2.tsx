import type { Meta, StoryObj } from '@storybook/react';
import { LanguageTabs } from '../LanguageTabs';
import { useState } from 'react';

const meta = {
    title: 'Video/LanguageTabs',
    component: LanguageTabs,
    parameters: {
        layout: 'centered',
    },
    tags: ['autodocs'],
    decorators: [
        (Story) => (
            <div className="w-[600px] bg-bg-secondary p-4 rounded-xl">
                <Story />
            </div>
        ),
    ],
} satisfies Meta<typeof LanguageTabs>;

export default meta;
type Story = StoryObj<typeof meta>;

const defaultArgs = {
    activeLanguage: 'default',
    localizations: {},
    savedCustomLanguages: [],
    onSwitchLanguage: () => { },
    onAddLanguage: () => { },
    onRemoveLanguage: () => { },
    onDeleteCustomLanguage: () => { },
};

export const Default: Story = {
    args: defaultArgs,
    render: (args) => {
        const [active, setActive] = useState(args.activeLanguage);
        return <LanguageTabs {...args} activeLanguage={active} onSwitchLanguage={setActive} />;
    }
};

export const WithLocalizations: Story = {
    args: {
        ...defaultArgs,
        localizations: {
            'es': { languageCode: 'es', title: 'Hola', description: 'Desc', tags: [] },
            'fr': { languageCode: 'fr', title: 'Bonjour', description: 'Desc', tags: [] }
        }
    },
    render: Default.render
};

export const WithCustomLanguages: Story = {
    args: {
        ...defaultArgs,
        savedCustomLanguages: [
            { code: 'de', name: 'German', flag: '🇩🇪' },
            { code: 'it', name: 'Italian', flag: '🇮🇹' }
        ]
    },
    render: Default.render
};
