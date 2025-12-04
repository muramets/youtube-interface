import type { Meta, StoryObj } from '@storybook/react';
import { VideoForm } from '../VideoForm';
import { useState } from 'react';

const meta = {
    title: 'Video/Modal/VideoForm',
    component: VideoForm,
    parameters: {
        layout: 'centered',
    },
    tags: ['autodocs'],
    decorators: [
        (Story) => (
            <div className="w-[600px] h-[600px] bg-bg-secondary p-4 rounded-xl border border-border overflow-hidden flex flex-col">
                <Story />
            </div>
        ),
    ],
} satisfies Meta<typeof VideoForm>;

export default meta;
type Story = StoryObj<typeof meta>;

const defaultArgs = {
    title: 'My Awesome Video',
    description: 'This is a description of the video.',
    tags: ['react', 'typescript', 'storybook'],
    activeLanguage: 'default',
    localizations: {},
    savedCustomLanguages: [],
    isPublished: false,
    publishedUrl: '',
    isStatsExpanded: false,
    viewCount: '1.2M',
    duration: '10:05',
    videoRender: '#1.1',
    audioRender: '#1.0',
    onSwitchLanguage: () => { },
    onAddLanguage: () => { },
    onRemoveLanguage: () => { },
    onDeleteCustomLanguage: () => { },
    setTitle: () => { },
    setDescription: () => { },
    setTags: () => { },
    setIsPublished: () => { },
    setPublishedUrl: () => { },
    setIsStatsExpanded: () => { },
    setViewCount: () => { },
    setDuration: () => { },
    setVideoRender: () => { },
    setAudioRender: () => { },
    onShowToast: () => { },
};

export const Default: Story = {
    args: defaultArgs,
    render: (args) => {
        const [title, setTitle] = useState(args.title);
        const [description, setDescription] = useState(args.description);
        const [tags, setTags] = useState(args.tags);
        const [isPublished, setIsPublished] = useState(args.isPublished);
        const [publishedUrl, setPublishedUrl] = useState(args.publishedUrl);
        const [isStatsExpanded, setIsStatsExpanded] = useState(args.isStatsExpanded);
        const [viewCount, setViewCount] = useState(args.viewCount);
        const [duration, setDuration] = useState(args.duration);
        const [videoRender, setVideoRender] = useState(args.videoRender);
        const [audioRender, setAudioRender] = useState(args.audioRender);

        return (
            <VideoForm
                {...args}
                title={title}
                setTitle={setTitle}
                description={description}
                setDescription={setDescription}
                tags={tags}
                setTags={setTags}
                isPublished={isPublished}
                setIsPublished={setIsPublished}
                publishedUrl={publishedUrl}
                setPublishedUrl={setPublishedUrl}
                isStatsExpanded={isStatsExpanded}
                setIsStatsExpanded={setIsStatsExpanded}
                viewCount={viewCount}
                setViewCount={setViewCount}
                duration={duration}
                setDuration={setDuration}
                videoRender={videoRender}
                setVideoRender={setVideoRender}
                audioRender={audioRender}
                setAudioRender={setAudioRender}
            />
        );
    }
};

export const Empty: Story = {
    args: {
        ...defaultArgs,
        title: '',
        description: '',
        tags: [],
        viewCount: '',
        duration: '',
        videoRender: '',
        audioRender: '',
    },
    render: Default.render
};

export const StatsExpanded: Story = {
    args: {
        ...defaultArgs,
        isStatsExpanded: true,
    },
    render: Default.render
};

export const Published: Story = {
    args: {
        ...defaultArgs,
        isPublished: true,
        publishedUrl: 'https://youtube.com/watch?v=123456',
    },
    render: Default.render
};

export const WithLocalizations: Story = {
    args: {
        ...defaultArgs,
        localizations: {
            'es': {
                languageCode: 'es',
                title: 'Mi Video Increíble',
                description: 'Esta es una descripción.',
                tags: ['react', 'español']
            }
        }
    },
    render: Default.render
};
