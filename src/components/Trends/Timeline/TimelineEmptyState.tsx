import React from 'react';

type EmptyStateVariant = 'no-data' | 'filtered' | 'channels-hidden';

interface TimelineEmptyStateProps {
    variant: EmptyStateVariant;
    onAddChannels: () => void;
    onClearFilters?: () => void;
}

// Premium SVG illustration for empty states
const EmptyStateIllustration: React.FC<{ showFilterIcon: boolean }> = ({ showFilterIcon }) => (
    <svg
        width="120"
        height="100"
        viewBox="0 0 120 100"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="opacity-40"
    >
        <defs>
            <linearGradient id="emptyStateGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="currentColor" stopOpacity="0.6" />
                <stop offset="100%" stopColor="currentColor" stopOpacity="0.2" />
            </linearGradient>
        </defs>

        {/* Back card */}
        <rect
            x="30" y="12"
            width="60" height="36"
            rx="4"
            fill="url(#emptyStateGradient)"
            stroke="currentColor"
            strokeWidth="1"
            strokeOpacity="0.3"
        />

        {/* Middle card */}
        <rect
            x="24" y="24"
            width="60" height="36"
            rx="4"
            fill="url(#emptyStateGradient)"
            stroke="currentColor"
            strokeWidth="1"
            strokeOpacity="0.4"
        />

        {/* Front card */}
        <rect
            x="18" y="36"
            width="60" height="36"
            rx="4"
            fill="url(#emptyStateGradient)"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeOpacity="0.5"
        />

        {/* Icon on front card */}
        {showFilterIcon ? (
            <g transform="translate(48, 54)">
                <circle cx="0" cy="0" r="8" fill="none" stroke="currentColor" strokeWidth="1.5" strokeOpacity="0.5" />
                <line x1="6" y1="6" x2="10" y2="10" stroke="currentColor" strokeWidth="1.5" strokeOpacity="0.5" strokeLinecap="round" />
            </g>
        ) : (
            <>
                <circle
                    cx="48" cy="54" r="10"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeOpacity="0.5"
                />
                <path
                    d="M45 50 L53 54 L45 58 Z"
                    fill="currentColor"
                    fillOpacity="0.5"
                />
            </>
        )}

        {/* Decorative dots */}
        <circle cx="84" cy="80" r="3" fill="currentColor" fillOpacity="0.3" />
        <circle cx="94" cy="80" r="2" fill="currentColor" fillOpacity="0.2" />
        <circle cx="102" cy="80" r="2" fill="currentColor" fillOpacity="0.15" />
    </svg>
);

const VARIANT_CONFIG: Record<EmptyStateVariant, { title: string; showFilterIcon: boolean }> = {
    'no-data': {
        title: 'No videos to display',
        showFilterIcon: false,
    },
    'filtered': {
        title: 'No videos match this view',
        showFilterIcon: true,
    },
    'channels-hidden': {
        title: 'All channels in view are hidden',
        showFilterIcon: false,
    },
};

const CLICKABLE_LINK_CLASSES =
    'text-text-primary opacity-80 hover:opacity-100 hover:text-white transition-opacity cursor-pointer hover:underline';

export const TimelineEmptyState: React.FC<TimelineEmptyStateProps> = ({
    variant,
    onAddChannels,
    onClearFilters,
}) => {
    const config = VARIANT_CONFIG[variant];

    return (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="text-center pointer-events-auto">
                <div className="mb-6 flex justify-center">
                    <EmptyStateIllustration showFilterIcon={config.showFilterIcon} />
                </div>

                <div className="text-text-secondary text-lg mb-2">
                    {config.title}
                </div>

                <div className="text-text-secondary text-sm">
                    {variant === 'channels-hidden' && (
                        <span>Toggle channel visibility in the sidebar</span>
                    )}
                    {variant === 'filtered' && (
                        <>
                            <span>Try adjusting your filters or </span>
                            <span onClick={onClearFilters} className={CLICKABLE_LINK_CLASSES}>
                                clear filters
                            </span>
                        </>
                    )}
                    {variant === 'no-data' && (
                        <>
                            <span onClick={onAddChannels} className={CLICKABLE_LINK_CLASSES}>
                                Add channels
                            </span>
                            {' and sync data'}
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};
