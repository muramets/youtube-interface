import React, { useMemo } from 'react';

interface DiffHighlightProps {
    text: string;
    comparisonText: string;
    className?: string;
}

/**
 * Highlights words in `text` that also appear in `comparisonText`.
 * Matches are case-insensitive.
 * Matching words are highlighted with red color and glow.
 */
export const DiffHighlight: React.FC<DiffHighlightProps> = ({
    text,
    comparisonText,
    className = ''
}) => {
    const parts = useMemo(() => {
        if (!text) return [];
        if (!comparisonText) return [{ text, match: false }];

        // Normalize comparison text for flexible matching (lowercase)
        // We split by non-alphanumeric characters to get "words"
        const comparisonWords = new Set(
            comparisonText.toLowerCase().split(/[^a-z0-9]+/i).filter(Boolean)
        );

        // Split original text but keep delimiters to reconstruct properly
        // This regex splits by spaces/punctuation but keeps them in the result array
        const tokens = text.split(/([^a-z0-9]+)/i);

        return tokens.map(token => {
            // If token is a delimiter/whitespace, just return it
            if (/^[^a-z0-9]+$/i.test(token)) {
                return { text: token, match: false };
            }

            const word = token.toLowerCase();
            const isMatch = comparisonWords.has(word) && word.length > 2; // Ignore very short words (stop words often)

            return { text: token, match: isMatch };
        });

    }, [text, comparisonText]);

    return (
        <span className={className} title={`Matches found in: "${comparisonText}"`}>
            {parts.map((part, i) => (
                part.match ? (
                    <span
                        key={i}
                        className="text-red-500 drop-shadow-[0_0_8px_rgba(239,68,68,0.6)] font-semibold transition-all duration-300"
                    >
                        {part.text}
                    </span>
                ) : (
                    <span key={i} className="opacity-50 transition-opacity duration-300 group-hover/diff:opacity-100">
                        {part.text}
                    </span>
                )
            ))}
        </span>
    );
};
