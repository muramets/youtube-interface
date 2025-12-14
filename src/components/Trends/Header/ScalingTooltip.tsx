import React from 'react';
import { createPortal } from 'react-dom';

interface ScalingTooltipProps {
    title: string;
    description: string;
    example: string;
    parentRect: DOMRect | null;
}

export const ScalingTooltip: React.FC<ScalingTooltipProps> = ({ title, description, example, parentRect }) => {
    if (!parentRect) return null;

    // Position to the left of the menu item
    const style: React.CSSProperties = {
        top: parentRect.top,
        right: window.innerWidth - parentRect.left + 8, // 8px gap
        position: 'fixed',
        // z-popover token = 300 (defined in tailwind.config.js)
    };

    return createPortal(
        <div
            className="z-popover bg-bg-secondary border border-black/10 dark:border-white/10 rounded-xl shadow-2xl p-3 w-64 animate-scale-in origin-right backdrop-blur-sm"
            style={style}
        >
            <div className="text-sm font-medium text-text-primary mb-1">{title}</div>
            <div className="text-xs text-text-secondary leading-relaxed mb-2">
                {description}
            </div>
            <div className="bg-black/5 dark:bg-white/5 rounded-lg p-2 text-xs text-text-tertiary border border-black/5 dark:border-white/5">
                <span className="text-text-secondary font-medium">Example:</span> {example}
            </div>
        </div>,
        document.body
    );
};
