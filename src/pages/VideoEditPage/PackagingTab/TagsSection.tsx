import React from 'react';
import { TagsInput } from '../../../components/TagsInput';

interface TagsSectionProps {
    tags: string[];
    setTags: (tags: string[]) => void;
}

export const TagsSection: React.FC<TagsSectionProps> = ({ tags, setTags }) => {
    return <TagsInput tags={tags} onChange={setTags} />;
};
