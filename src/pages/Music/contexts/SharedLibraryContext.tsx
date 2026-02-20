// =============================================================================
// SharedLibraryContext — centralized permission + credential resolution
// =============================================================================
// Replaces prop drilling of granteePermissions, trackOwnerUserId/ChannelId,
// isSharedView, and trackSource through the Music page component tree.
//
// Provider lives in MusicPage. Consumers call useSharedLibrary().
// Sidebar playlist items (MusicPlaylistItem → MusicPlaylistContextMenu)
// keep their own props because each shared library entry has a different owner.
// =============================================================================

import { createContext, useContext } from 'react';
import type { SharePermissions } from '../../../core/types/musicSharing';
import type { TrackSource } from '../../../core/types/musicPlaylist';
import { OWNER_PERMISSIONS } from '../../../core/types/musicSharing';

export interface SharedLibraryContextValue {
    /** Effective userId for mutations (owner's when viewing shared library) */
    effectiveUserId: string;
    /** Effective channelId for mutations */
    effectiveChannelId: string;
    /** Grantee's own userId (always the logged-in user) */
    granteeUserId: string;
    /** Grantee's own channelId */
    granteeChannelId: string;
    /** Granular permissions — OWNER_PERMISSIONS for own library */
    permissions: SharePermissions;
    /** Whether currently viewing a shared library */
    isSharedView: boolean;
    /** Source info for shared tracks (ownerUserId + channelId) */
    trackSource?: TrackSource;
}

/** Default context: own library with full permissions. */
const defaultValue: SharedLibraryContextValue = {
    effectiveUserId: '',
    effectiveChannelId: '',
    granteeUserId: '',
    granteeChannelId: '',
    permissions: OWNER_PERMISSIONS,
    isSharedView: false,
    trackSource: undefined,
};

export const SharedLibraryContext = createContext<SharedLibraryContextValue>(defaultValue);

/**
 * Access the current shared library context.
 * Must be called within <SharedLibraryContext.Provider> (i.e. inside MusicPage).
 */
export const useSharedLibrary = (): SharedLibraryContextValue =>
    useContext(SharedLibraryContext);
