import React from 'react';

interface ChatContextBarProps {
    contextPercent: number;
    contextUsed: number;
    isContextFull: boolean;
    visible: boolean;
}

export const ChatContextBar: React.FC<ChatContextBarProps> = ({
    contextPercent,
    contextUsed,
    isContextFull,
    visible,
}) => {
    if (!visible) return null;

    return (
        <>
            {contextUsed > 0 && (
                <div className="h-[3px] w-full bg-border shrink-0">
                    <div
                        className={`h-full transition-[width] duration-400 ease-in-out ${contextPercent >= 90 ? 'bg-[#e05252]' : contextPercent >= 70 ? 'bg-[#e8a33a]' : 'bg-accent'}`}
                        style={{ width: `${contextPercent}%` }}
                    />
                </div>
            )}

            {isContextFull && (
                <div className="chat-error-banner px-3 py-2 mx-2.5 mb-1.5 rounded-md bg-[rgba(204,0,0,0.08)] border border-[rgba(204,0,0,0.15)] text-[color:var(--danger-color,#cc0000)] text-xs flex items-center gap-2">
                    <span>Context window full. Start a new conversation or delete old messages.</span>
                </div>
            )}
        </>
    );
};
