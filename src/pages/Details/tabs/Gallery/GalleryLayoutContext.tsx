/**
 * GalleryLayoutContext
 * 
 * Context to share calculated card width from GalleryGrid to GalleryCardGhost.
 * This ensures the drag ghost has the exact same dimensions as the grid cards.
 */

import React, { createContext, useContext, useState, useCallback } from 'react';

interface GalleryLayoutContextValue {
    cardWidth: number;
    setCardWidth: (width: number) => void;
}

const GalleryLayoutContext = createContext<GalleryLayoutContextValue | null>(null);

export const GalleryLayoutProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [cardWidth, setCardWidthState] = useState(320); // Default fallback

    const setCardWidth = useCallback((width: number) => {
        setCardWidthState(prev => prev !== width ? width : prev);
    }, []);

    return (
        <GalleryLayoutContext.Provider value={{ cardWidth, setCardWidth }}>
            {children}
        </GalleryLayoutContext.Provider>
    );
};

// eslint-disable-next-line react-refresh/only-export-components
export const useGalleryLayout = () => {
    const context = useContext(GalleryLayoutContext);
    if (!context) {
        // Fallback for usage outside provider
        return { cardWidth: 320, setCardWidth: () => { } };
    }
    return context;
};
