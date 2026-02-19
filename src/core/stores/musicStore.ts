// =============================================================================
// MUSIC STORE — Thin compose + selectors facade
// =============================================================================
//
// Domain logic lives in slice modules:
//   - playbackSlice.ts  — playback state, queue, volume, repeat, seek
//   - librarySlice.ts   — tracks, settings, sharing, filters, version grouping
//   - playlistSlice.ts  — playlists CRUD, ordering, track management
//
// This file composes them into a single Zustand store and exports
// memoized selectors. All consumers import from this file — no need
// to import slices directly.
// =============================================================================

import { create } from 'zustand';
import type { Track, MusicGenre, MusicTag } from '../types/track';
import type { MusicPlaylist } from '../types/musicPlaylist';
import { createPlaybackSlice, type PlaybackSlice } from './slices/playbackSlice';
import { createLibrarySlice, type LibrarySlice } from './slices/librarySlice';
import { createPlaylistSlice, type PlaylistSlice } from './slices/playlistSlice';

// ── Combined state type ─────────────────────────────────────────────────────
export type MusicState = PlaybackSlice & LibrarySlice & PlaylistSlice;

// ── Store ───────────────────────────────────────────────────────────────────
export const useMusicStore = create<MusicState>((...a) => ({
    ...createPlaybackSlice(...a),
    ...createLibrarySlice(...a),
    ...createPlaylistSlice(...a),
}));

// ── Memoized selectors: own + shared (deduped by id) ────────────────────────
// Cache last inputs to avoid creating new arrays on every store access.
// Same pattern as reselect: recompute only when input references change.

let _cachedAllTracks: Track[] = [];
let _lastOwnTracks: Track[] = [];
let _lastSharedTracks: Track[] = [];

/** Merged own + shared tracks (deduped by id) — use as `useMusicStore(selectAllTracks)` */
export const selectAllTracks = (s: MusicState): Track[] => {
    if (
        s.tracks === _lastOwnTracks &&
        s.sharedTracks === _lastSharedTracks
    ) {
        return _cachedAllTracks;
    }
    _lastOwnTracks = s.tracks;
    _lastSharedTracks = s.sharedTracks;

    if (s.sharedTracks.length === 0) {
        _cachedAllTracks = s.tracks;
    } else {
        const ownIds = new Set(s.tracks.map((t) => t.id));
        _cachedAllTracks = [...s.tracks, ...s.sharedTracks.filter((t) => !ownIds.has(t.id))];
    }
    return _cachedAllTracks;
};

let _cachedAllPlaylists: MusicPlaylist[] = [];
let _lastOwnPlaylists: MusicPlaylist[] = [];
let _lastSharedPlaylists: MusicPlaylist[] = [];

/** Merged own + shared playlists — use as `useMusicStore(selectAllPlaylists)` */
export const selectAllPlaylists = (s: MusicState): MusicPlaylist[] => {
    if (s.musicPlaylists === _lastOwnPlaylists && s.sharedPlaylists === _lastSharedPlaylists) {
        return _cachedAllPlaylists;
    }
    _lastOwnPlaylists = s.musicPlaylists;
    _lastSharedPlaylists = s.sharedPlaylists;

    if (s.sharedPlaylists.length === 0) {
        _cachedAllPlaylists = s.musicPlaylists;
    } else {
        const ownIds = new Set(s.musicPlaylists.map((p) => p.id));
        _cachedAllPlaylists = [...s.musicPlaylists, ...s.sharedPlaylists.filter((p) => !ownIds.has(p.id))];
    }
    return _cachedAllPlaylists;
};

let _cachedAllTags: MusicTag[] = [];
let _lastOwnTags: MusicTag[] = [];
let _lastSharedTags: MusicTag[] = [];

/** Merged own + shared tags (deduped by id) — use as `useMusicStore(selectAllTags)` */
export const selectAllTags = (s: MusicState): MusicTag[] => {
    if (s.tags === _lastOwnTags && s.sharedTags === _lastSharedTags) {
        return _cachedAllTags;
    }
    _lastOwnTags = s.tags;
    _lastSharedTags = s.sharedTags;

    if (s.sharedTags.length === 0) {
        _cachedAllTags = s.tags;
    } else {
        const ownIds = new Set(s.tags.map((t) => t.id));
        _cachedAllTags = [...s.tags, ...s.sharedTags.filter((t) => !ownIds.has(t.id))];
    }
    return _cachedAllTags;
};

let _cachedAllCategoryOrder: string[] = [];
let _lastOwnCatOrder: string[] = [];
let _lastSharedCatOrder: string[] = [];

/** Merged own + shared category order (deduped) — use as `useMusicStore(selectAllCategoryOrder)` */
export const selectAllCategoryOrder = (s: MusicState): string[] => {
    if (s.categoryOrder === _lastOwnCatOrder && s.sharedCategoryOrder === _lastSharedCatOrder) {
        return _cachedAllCategoryOrder;
    }
    _lastOwnCatOrder = s.categoryOrder;
    _lastSharedCatOrder = s.sharedCategoryOrder;

    if (s.sharedCategoryOrder.length === 0) {
        _cachedAllCategoryOrder = s.categoryOrder;
    } else {
        const ownSet = new Set(s.categoryOrder);
        _cachedAllCategoryOrder = [...s.categoryOrder, ...s.sharedCategoryOrder.filter((c) => !ownSet.has(c))];
    }
    return _cachedAllCategoryOrder;
};

let _cachedAllFeaturedCategories: string[] = [];
let _lastOwnFeatured: string[] = [];
let _lastSharedFeatured: string[] = [];

/** Merged own + shared featured categories (deduped) — use as `useMusicStore(selectAllFeaturedCategories)` */
export const selectAllFeaturedCategories = (s: MusicState): string[] => {
    if (s.featuredCategories === _lastOwnFeatured && s.sharedFeaturedCategories === _lastSharedFeatured) {
        return _cachedAllFeaturedCategories;
    }
    _lastOwnFeatured = s.featuredCategories;
    _lastSharedFeatured = s.sharedFeaturedCategories;

    if (s.sharedFeaturedCategories.length === 0) {
        _cachedAllFeaturedCategories = s.featuredCategories;
    } else {
        const ownSet = new Set(s.featuredCategories);
        _cachedAllFeaturedCategories = [...s.featuredCategories, ...s.sharedFeaturedCategories.filter((c) => !ownSet.has(c))];
    }
    return _cachedAllFeaturedCategories;
};

let _cachedAllGenres: MusicGenre[] = [];
let _lastOwnGenres: MusicGenre[] = [];
let _lastSharedGenres: MusicGenre[] = [];

/** Merged own + shared genres (deduped by id) — use as `useMusicStore(selectAllGenres)` */
export const selectAllGenres = (s: MusicState): MusicGenre[] => {
    if (s.genres === _lastOwnGenres && s.sharedGenres === _lastSharedGenres) {
        return _cachedAllGenres;
    }
    _lastOwnGenres = s.genres;
    _lastSharedGenres = s.sharedGenres;

    if (s.sharedGenres.length === 0) {
        _cachedAllGenres = s.genres;
    } else {
        const ownIds = new Set(s.genres.map((g) => g.id));
        _cachedAllGenres = [...s.genres, ...s.sharedGenres.filter((g) => !ownIds.has(g.id))];
    }
    return _cachedAllGenres;
};
