import React from 'react';
import { TagsInput } from '../../../components/TagsInput';

interface TagsSectionProps {
    tags: string[];
    setTags: (tags: string[]) => void;
}

export const TagsSection: React.FC<TagsSectionProps> = ({ tags, setTags }) => {
    return (
        <div className="flex flex-col gap-2">
            <label className="text-xs text-text-secondary font-medium tracking-wider uppercase">
                Tags
            </label>
            <TagsInput tags={tags} onChange={setTags} />
        </div>
    );
};
