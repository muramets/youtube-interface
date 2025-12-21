import React from 'react';
import { Pencil } from 'lucide-react';

interface ABTitlesDisplayProps {
    titles: string[];
    status: 'running' | 'completed' | 'draft';
    onEditClick: () => void;
    readOnly?: boolean;
}

export const ABTitlesDisplay: React.FC<ABTitlesDisplayProps> = ({
    titles,
    status,
    onEditClick,
    readOnly = false
}) => {
    const statusText = {
        running: 'Running...',
        completed: 'Completed',
        draft: 'Draft'
    };

    const statusColor = {
        running: 'text-text-secondary',
        completed: 'text-green-500',
        draft: 'text-text-secondary'
    };

    return (
        <div className="flex flex-col gap-3">
            {/* Header */}
            <div className="flex flex-col gap-1">
                <span className="text-sm font-medium text-text-primary">A/B Testing titles</span>
                <span className={`text-xs ${statusColor[status]}`}>{statusText[status]}</span>
            </div>

            {/* Titles list */}
            <div className="flex flex-col gap-2">
                {titles.map((title, index) => (
                    <div
                        key={index}
                        className="text-text-primary text-xs"
                    >
                        {title}
                    </div>
                ))}
            </div>

            {/* Edit button - YouTube style */}
            {!readOnly && (
                <button
                    onClick={onEditClick}
                    className="self-start flex items-center gap-2 px-4 py-2
                        bg-[#3F3F3F] hover:bg-[#535353] text-text-primary text-sm font-medium
                        rounded-full transition-colors"
                >
                    <Pencil size={16} />
                    Edit title
                </button>
            )}
        </div>
    );
};
