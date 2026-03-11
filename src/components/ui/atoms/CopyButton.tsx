import React, { useState, useCallback } from 'react';
import { Copy, Check } from 'lucide-react';

interface CopyButtonProps {
    text: string;
    /** Size of the icon (default: 11) */
    size?: number;
    /** Label for tooltip (default: "Copy") */
    title?: string;
    className?: string;
}

export const CopyButton: React.FC<CopyButtonProps> = React.memo(({ text, size = 11, title = 'Copy', className = '' }) => {
    const [copied, setCopied] = useState(false);

    const handleCopy = useCallback(async () => {
        try {
            await navigator.clipboard.writeText(text);
        } catch {
            // Fallback for non-secure contexts (HTTP, iframes)
            const textarea = document.createElement('textarea');
            textarea.value = text;
            textarea.style.position = 'fixed';
            textarea.style.opacity = '0';
            document.body.appendChild(textarea);
            textarea.select();
            document.execCommand('copy');
            document.body.removeChild(textarea);
        }
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
    }, [text]);

    return (
        <button
            className={`group bg-transparent border-none text-text-tertiary cursor-pointer p-0.5 flex opacity-0 transition-opacity duration-150 hover:text-text-primary ${copied ? '!text-green-500 !opacity-100' : ''} ${className}`}
            onClick={handleCopy}
            title={copied ? 'Copied!' : title}
        >
            {copied ? <Check size={size} /> : <Copy size={size} />}
        </button>
    );
});
CopyButton.displayName = 'CopyButton';
