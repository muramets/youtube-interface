import { useState, useCallback, useMemo } from 'react';

interface PickTheWinnerState {
    isActive: boolean;
    rankedVideoIds: string[];  // Stack: first = rank 1, etc.
}

export function usePickTheWinner(totalVideoCount: number) {
    const [state, setState] = useState<PickTheWinnerState>({
        isActive: false,
        rankedVideoIds: [],
    });

    const activate = useCallback(() => {
        setState({ isActive: true, rankedVideoIds: [] });
    }, []);

    const deactivate = useCallback(() => {
        setState({ isActive: false, rankedVideoIds: [] });
    }, []);

    const handleVideoClick = useCallback((videoId: string) => {
        setState(prev => {
            if (!prev.isActive) return prev;

            // If the video is the LAST ranked one, undo it (stack-based undo)
            if (prev.rankedVideoIds.length > 0 && prev.rankedVideoIds[prev.rankedVideoIds.length - 1] === videoId) {
                return {
                    ...prev,
                    rankedVideoIds: prev.rankedVideoIds.slice(0, -1),
                };
            }

            // If already ranked (not the last one), do nothing
            if (prev.rankedVideoIds.includes(videoId)) {
                return prev;
            }

            // Rank the video
            return {
                ...prev,
                rankedVideoIds: [...prev.rankedVideoIds, videoId],
            };
        });
    }, []);

    const getRank = useCallback((videoId: string): number | null => {
        const index = state.rankedVideoIds.indexOf(videoId);
        return index >= 0 ? index + 1 : null;
    }, [state.rankedVideoIds]);

    return useMemo(() => {
        const isComplete = state.rankedVideoIds.length === totalVideoCount && totalVideoCount > 0;
        const progress = { ranked: state.rankedVideoIds.length, total: totalVideoCount };

        return {
            isActive: state.isActive,
            rankedVideoIds: state.rankedVideoIds,
            activate,
            deactivate,
            handleVideoClick,
            getRank,
            isComplete,
            progress,
        };
    }, [state, activate, deactivate, handleVideoClick, getRank, totalVideoCount]);
}
