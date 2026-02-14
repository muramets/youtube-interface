import React, { useState } from 'react';
import { BookOpen, ChevronDown, ChevronUp } from 'lucide-react';

interface ChatSummaryBannerProps {
    summary: string;
}

export const ChatSummaryBanner: React.FC<ChatSummaryBannerProps> = ({ summary }) => {
    const [isExpanded, setIsExpanded] = useState(false);

    if (!summary) return null;

    return (
        <div className="shrink-0 mx-3 border border-border rounded-lg bg-bg-secondary overflow-hidden transition-colors duration-150 hover:border-text-tertiary">
            <button
                className="flex items-center justify-between w-full px-3 py-2 bg-transparent border-none text-text-secondary text-xs cursor-pointer transition-colors duration-100 hover:text-text-primary"
                onClick={() => setIsExpanded(!isExpanded)}
            >
                <div className="flex items-center gap-1.5">
                    <BookOpen size={14} />
                    <span className="font-medium tracking-wide">Conversation Summary</span>
                </div>
                {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>
            {isExpanded && (
                <div className="px-3 pb-2.5 text-xs leading-relaxed text-text-secondary whitespace-pre-wrap max-h-[200px] overflow-y-auto border-t border-border">
                    {summary}
                </div>
            )}
        </div>
    );
};
