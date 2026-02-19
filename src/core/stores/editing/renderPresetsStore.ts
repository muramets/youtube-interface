import { create } from 'zustand';
import { collection, query, orderBy, limit, getDocs, doc, deleteDoc } from 'firebase/firestore';
import { db } from '../../../config/firebase';
import type { RenderPreset, TimelineTrack } from '../../types/editing';
import type { Track } from '../../types/track';
import { DEFAULT_GENRES } from '../../types/track';
import { useEditingStore } from './editingStore';
import { useUIStore } from '../uiStore';
import { parseFirestoreTimestamp } from '../../utils/firestoreUtils';

// ─── Store ─────────────────────────────────────────────────────────────

interface RenderPresetsState {
    presets: RenderPreset[];
    loading: boolean;
    error: string | null;
    loadedChannelId: string | null;
}

interface RenderPresetsActions {
    /** Fetch recent completed renders for the channel */
    fetchPresets: (userId: string, channelId: string) => Promise<void>;
    /** Apply a preset's audio timeline to the current editing session */
    applyPreset: (preset: RenderPreset, musicTracks: Track[]) => void;
    /** Delete a preset (optimistic) */
    deletePreset: (userId: string, channelId: string, presetId: string) => void;
    /** Reset store (e.g. on channel switch) */
    reset: () => void;
}

const initialState: RenderPresetsState = {
    presets: [],
    loading: false,
    error: null,
    loadedChannelId: null,
};

export const useRenderPresetsStore = create<RenderPresetsState & RenderPresetsActions>(
    (set, get) => ({
        ...initialState,

        fetchPresets: async (userId, channelId) => {
            // Cache: don't refetch if already loaded for this channel
            if (get().loadedChannelId === channelId) return;

            set({ loading: true, error: null });

            try {
                const presetsRef = collection(
                    db,
                    `users/${userId}/channels/${channelId}/renderPresets`,
                );
                const q = query(
                    presetsRef,
                    orderBy('completedAt', 'desc'),
                    limit(20),
                );
                const snap = await getDocs(q);

                const presets: RenderPreset[] = [];
                for (const d of snap.docs) {
                    const data = d.data();
                    const tracks = (data.tracks as Array<Record<string, unknown>> | undefined) || [];
                    const completedAt = parseFirestoreTimestamp(data.completedAt) ?? 0;

                    presets.push({
                        renderId: d.id,
                        videoId: (data.videoId as string) || '',
                        videoTitle: (data.videoTitle as string) || 'Untitled',
                        completedAt,
                        tracks: tracks.map((t) => ({
                            title: (t.title as string) || '',
                            volume: (t.volume as number) ?? 1,
                            trimStart: (t.trimStart as number) ?? 0,
                            trimEnd: (t.trimEnd as number) ?? 0,
                            duration: (t.duration as number) ?? 0,
                            audioStoragePath: (t.audioStoragePath as string) || '',
                        })),
                        resolution: (data.resolution as RenderPreset['resolution']) || '1080p',
                        loopCount: (data.loopCount as number) ?? 1,
                        masterVolume: (data.masterVolume as number) ?? 1,
                        imageUrl: (data.imageUrl as string) || undefined,
                    });
                }

                set({ presets, loading: false, loadedChannelId: channelId });
            } catch (err) {
                console.error('[renderPresets] fetchPresets failed:', err);
                set({
                    loading: false,
                    error: err instanceof Error ? err.message : 'Failed to load presets',
                });
            }
        },

        applyPreset: (preset, musicTracks) => {
            const { tracks: presetTracks, resolution, loopCount, masterVolume } = preset;

            // Build a lookup: audioStoragePath → Track (for matching)
            const storagePathToTrack = new Map<string, { track: Track; variant: 'vocal' | 'instrumental' }>();
            for (const mt of musicTracks) {
                if (mt.vocalStoragePath) {
                    storagePathToTrack.set(mt.vocalStoragePath, { track: mt, variant: 'vocal' });
                }
                if (mt.instrumentalStoragePath) {
                    storagePathToTrack.set(mt.instrumentalStoragePath, { track: mt, variant: 'instrumental' });
                }
            }

            // Hydrate each preset track
            const hydrated: TimelineTrack[] = [];
            let unavailableCount = 0;

            for (const pt of presetTracks) {
                const match = storagePathToTrack.get(pt.audioStoragePath);
                if (!match) {
                    unavailableCount++;
                    continue;
                }

                const { track: source, variant } = match;
                const isVocal = variant === 'vocal';
                const genreDef = DEFAULT_GENRES.find((g) => g.id === source.genre);

                hydrated.push({
                    id: `${source.id}-${variant}-${crypto.randomUUID()}`,
                    trackId: source.id,
                    variant,
                    duration: source.duration,
                    volume: pt.volume,
                    genre: source.genre,
                    genreColor: genreDef?.color || '#9CA3AF',
                    title: source.title,
                    artist: source.artist,
                    coverUrl: source.coverUrl,
                    audioUrl: (isVocal ? source.vocalUrl : source.instrumentalUrl) || '',
                    audioStoragePath: isVocal ? source.vocalStoragePath : source.instrumentalStoragePath,
                    peaks: isVocal ? source.vocalPeaks : source.instrumentalPeaks,
                    trimStart: pt.trimStart,
                    trimEnd: pt.trimEnd,
                });
            }

            if (hydrated.length === 0) {
                useUIStore.getState().showToast(
                    'None of the tracks from this render are in your library',
                    'error',
                );
                return;
            }

            // Apply to editing store — full replace
            const editing = useEditingStore.getState();
            editing.reorderTracks(hydrated);
            editing.setResolution(resolution);
            editing.setLoopCount(loopCount);
            editing.setVolume(masterVolume);

            if (unavailableCount > 0) {
                useUIStore.getState().showToast(
                    `Applied! ${unavailableCount} track${unavailableCount > 1 ? 's' : ''} unavailable — removed from timeline`,
                    'error',
                );
            } else {
                useUIStore.getState().showToast(
                    `Applied audio timeline from "${preset.videoTitle}"`,
                    'success',
                );
            }
        },

        deletePreset: (userId, channelId, presetId) => {
            // Optimistic: remove from local state immediately
            const prev = get().presets;
            set({ presets: prev.filter((p) => p.renderId !== presetId) });

            // Delete from Firestore
            const ref = doc(db, `users/${userId}/channels/${channelId}/renderPresets/${presetId}`);
            deleteDoc(ref).catch((err) => {
                console.error('[renderPresets] deletePreset failed:', err);
                // Rollback
                set({ presets: prev });
                useUIStore.getState().showToast('Failed to delete preset', 'error');
            });
        },

        reset: () => set(initialState),
    }),
);
