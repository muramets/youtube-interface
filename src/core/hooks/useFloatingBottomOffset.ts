/**
 * useFloatingBottomOffset — shared positioning logic for floating FABs
 *
 * Computes the bottom offset (Tailwind class + px value) based on:
 * - Audio player visibility (Music page)
 * - Zoom controls (Home / Playlist detail)
 * - Timeline controls (Trends)
 * - Editing tab with collapsed browser
 */
import { useLocation, useSearchParams } from 'react-router-dom';
import { useMusicStore } from '../stores/musicStore';
import { useEditingStore } from '../stores/editing/editingStore';

interface FloatingOffset {
    /** Tailwind bottom-* class */
    bottomClass: string;
    /** Numeric px value for programmatic use */
    bottomPx: number;
    /** Tailwind right-* class for horizontal position */
    rightClass: string;
    /** Numeric px value for right offset */
    rightPx: number;
}

export function useFloatingBottomOffset(): FloatingOffset {
    const { pathname } = useLocation();
    const [searchParams] = useSearchParams();
    const hasAudioPlayer = !!useMusicStore((s) => s.playingTrackId);
    const isBrowserOpen = useEditingStore((s) => s.isBrowserOpen);

    // Pages with zoom controls in bottom-right: Home ("/") and Playlist detail ("/playlists/:id")
    const hasZoomControls = pathname === '/' || /^\/playlists\/[^/]+$/.test(pathname);

    // Trends page has timeline controls (zoom pill + vertical spread pill) in bottom-right
    const hasTimelineControls = pathname === '/trends';

    // Editing page with collapsed track browser — render button sits in bottom-right
    const isEditingCollapsed =
        /^\/video\/[^/]+\/[^/]+\/details$/.test(pathname) &&
        searchParams.get('tab') === 'editing' &&
        !isBrowserOpen;

    // Bottom offset: static Tailwind classes (dynamic template literals break JIT purge)
    const bottomClass = hasTimelineControls
        ? hasAudioPlayer ? 'bottom-[134px]' : 'bottom-[62px]'
        : hasZoomControls
            ? hasAudioPlayer ? 'bottom-[144px]' : 'bottom-[88px]'
            : hasAudioPlayer
                ? isEditingCollapsed ? 'bottom-[144px]' : 'bottom-[88px]'
                : 'bottom-8';

    const bottomPx = hasTimelineControls
        ? hasAudioPlayer ? 134 : 62
        : hasZoomControls
            ? hasAudioPlayer ? 144 : 88
            : hasAudioPlayer
                ? isEditingCollapsed ? 144 : 88
                : 32;

    // Horizontal offset: on Trends, shift left to sit in the corner pocket
    const rightClass = hasTimelineControls ? 'right-[70px]' : 'right-8';
    const rightPx = hasTimelineControls ? 70 : 32;

    return { bottomClass, bottomPx, rightClass, rightPx };
}
