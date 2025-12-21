import React from 'react';

interface ABTitlesDisplayProps {
    titles: string[];
    status: 'running' | 'completed' | 'draft';
    onEditClick: () => void;
    readOnly?: boolean;
    results?: number[];
}

export const ABTitlesDisplay: React.FC<ABTitlesDisplayProps> = ({
    titles,
    status,
    onEditClick,
    readOnly = false,
    results = []
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
            <div className="flex flex-col gap-4">
                {titles.map((title, index) => {
                    const percentage = results[index] || 0;
                    const maxPercentage = Math.max(...results, 0);
                    const isWinner = percentage > 0 && percentage === maxPercentage;

                    return (
                        <div key={index} className="flex flex-col gap-2">
                            <div className={`text-sm ${isWinner ? 'text-white font-medium' : 'text-text-primary'}`}>
                                {title}
                            </div>

                            {/* Result Bar */}
                            {(status === 'completed' || status === 'running') && (
                                <div className="group relative">
                                    <div className="flex items-center gap-3">
                                        <div className="flex-1 h-1.5 bg-bg-secondary rounded-full overflow-hidden">
                                            <div
                                                className={`h-full rounded-full transition-all duration-500 ${isWinner
                                                    ? 'bg-gradient-to-r from-blue-500 to-indigo-500 shadow-[0_0_10px_rgba(59,130,246,0.5)]'
                                                    : 'bg-[#3F3F3F]'
                                                    }`}
                                                style={{ width: `${percentage}%` }}
                                            />
                                        </div>
                                        <div className="relative min-w-[3rem] text-right">
                                            <span className={`text-lg font-medium ${isWinner ? 'text-blue-400' : 'text-text-secondary'}`}>
                                                {percentage}%
                                            </span>
                                        </div>
                                    </div>

                                    {isWinner && (
                                        <div className="absolute -left-2 top-1/2 -translate-y-1/2 w-1 h-6 bg-blue-500 rounded-full opacity-0 group-hover:opacity-100 transition-opacity" />
                                    )}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>

            {/* Edit button - YouTube style */}
            {!readOnly && (
                <button
                    onClick={onEditClick}
                    className="self-start flex items-center gap-2 px-3 py-1.5 mt-2
                        bg-[#3F3F3F] hover:bg-[#535353] rounded-full text-sm font-medium text-text-primary 
                        transition-colors"
                >
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M12 1a1 1 0 011 1v20a1 1 0 11-2 0V2a1 1 0 011-1Zm-2 4H3v14h7v2H3a2 2 0 01-1.99-1.796L1 19V5a2 2 0 012-2h7v2Zm11-2a2 2 0 012 2v14a2 2 0 01-2 2h-7v-4h4.132a1 1 0 00.832-1.555L14 8V3h7Zm-11 8.604L7.736 15H10v2H5.868a1 1 0 01-.832-1.555L10 8v3.606Z" />
                    </svg>
                    A/B Testing
                </button>
            )}
        </div>
    );
};
