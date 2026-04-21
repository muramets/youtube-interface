// =============================================================================
// listMusicLibrary handler — Music library discovery
//
// Returns genres, tags, and (optionally) existing tracks for a channel.
// Read-only. Use before uploadTrack to discover valid genre/tag ids.
// =============================================================================

import { db } from "../../../../shared/db.js";
import type { ToolContext } from "../../types.js";
import { resolveTargetChannel, readMusicSettings } from "./musicLibrary.js";

interface TrackSummary {
    id: string;
    title: string;
    artist?: string;
    genre: string;
    tags: string[];
    bpm?: number;
    duration: number;
    hasVocal: boolean;
    hasInstrumental: boolean;
    hasCover: boolean;
    liked?: boolean;
    createdAt: number;
}

export async function handleListMusicLibrary(
    args: Record<string, unknown>,
    ctx: ToolContext,
): Promise<Record<string, unknown>> {
    try {
        const { channelId, basePath, settingsDocPath } = resolveTargetChannel(ctx, args.targetChannelId);
        const includeTracks = args.includeTracks === true;

        const settings = await readMusicSettings(settingsDocPath);

        const response: Record<string, unknown> = {
            channelId,
            genres: settings.genres.map((g) => ({
                id: g.id,
                name: g.name,
                color: g.color,
                order: g.order,
            })),
            tags: settings.tags.map((t) => ({
                id: t.id,
                name: t.name,
                category: t.category,
            })),
        };

        if (includeTracks) {
            const tracksSnap = await db.collection(`${basePath}/tracks`).get();
            const tracks: TrackSummary[] = tracksSnap.docs.map((doc) => {
                const t = doc.data();
                return {
                    id: doc.id,
                    title: (t.title as string) ?? "",
                    artist: t.artist as string | undefined,
                    genre: (t.genre as string) ?? "",
                    tags: Array.isArray(t.tags) ? (t.tags as string[]) : [],
                    bpm: t.bpm as number | undefined,
                    duration: (t.duration as number) ?? 0,
                    hasVocal: Boolean(t.vocalUrl),
                    hasInstrumental: Boolean(t.instrumentalUrl),
                    hasCover: Boolean(t.coverUrl),
                    liked: t.liked as boolean | undefined,
                    createdAt: (t.createdAt as number) ?? 0,
                };
            });
            tracks.sort((a, b) => b.createdAt - a.createdAt);
            response.tracks = tracks;
            response.trackCount = tracks.length;
        }

        return response;
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { error: `Failed to list music library: ${message}` };
    }
}
