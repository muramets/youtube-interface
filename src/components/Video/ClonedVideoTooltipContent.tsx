import React, { useState } from 'react';
import { Copy, Check } from 'lucide-react';

interface ClonedVideoTooltipContentProps {
    version: number;
    filename: string;
}

export const ClonedVideoTooltipContent: React.FC<ClonedVideoTooltipContentProps> = ({ version, filename }) => {
    const [copied, setCopied] = useState(false);

    const handleCopy = (e: React.MouseEvent) => {
        e.stopPropagation();
        navigator.clipboard.writeText(filename);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <div className="flex flex-col gap-1 min-w-[200px]">
            <div className="font-medium text-white">
                v.{version}
            </div>
            <div className="flex items-center justify-between gap-3 text-sm text-gray-300">
                <span className="truncate max-w-[180px]" title={filename}>
                    {filename}
                </span>
                <button
                    onClick={handleCopy}
                    className="p-1.5 rounded-md hover:bg-white/10 text-white transition-colors border-none cursor-pointer flex-shrink-0"
                    title="Copy filename"
                >
                    {copied ? <Check size={14} className="text-green-400" /> : <Copy size={14} />}
                </button>
            </div>
        </div>
    );
};
