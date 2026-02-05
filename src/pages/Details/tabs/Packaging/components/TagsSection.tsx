import React from 'react';
import { TagsInput } from '../../../../../components/ui/TagsInput';

interface TagsSectionProps {
    tags: string[];
    setTags: (tags: string[]) => void;
    readOnly?: boolean;
}

export const TagsSection: React.FC<TagsSectionProps> = ({ tags, setTags, readOnly = false }) => {
    return <TagsInput tags={tags} onChange={setTags} readOnly={readOnly} />;
};
