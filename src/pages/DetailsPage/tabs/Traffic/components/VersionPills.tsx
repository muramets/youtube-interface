import React from 'react';

export interface VersionPillsProps {
    versions: Array<{
        version: number | 'draft';
        label: string;
    }>;
    activeVersion: number | 'draft';
    onVersionChange: (version: number | 'draft') => void;
}

export const VersionPills: React.FC<VersionPillsProps> = ({
    versions,
    activeVersion,
    onVersionChange
}) => {
    return (
        <div className="flex items-center gap-2">
            {versions.map(v => (
                <button
                    key={v.version}
                    onClick={() => onVersionChange(v.version)}
                    className={`
                        px-3 py-1.5 rounded-full text-xs font-medium transition-colors flex-shrink-0
                        ${v.version === activeVersion
                            ? 'bg-text-primary text-bg-primary'
                            : 'bg-transparent border border-white/10 text-text-secondary hover:bg-white/5 hover:text-text-primary'
                        }
                    `}
                >
                    {v.label}
                </button>
            ))}
        </div>
    );
};
