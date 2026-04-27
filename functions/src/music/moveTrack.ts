/**
 * music/moveTrack.ts — Move a music track from one channel to another.
 *
 * Atomicity strategy: copy storage files to dest with fresh tokens, write the
 * new track doc with rewritten paths/URLs, verify, then clean up source
 * playlist references and delete source storage + doc. If anything fails
 * mid-way, source remains intact and dest may be partial.
 *
 * Group/version-link relationships and linkedVideoIds are NOT preserved —
 * they reference IDs scoped to the source channel. The track lands in dest
 * as standalone; user can re-link manually.
 */
import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as crypto from "crypto";
import { admin, db } from "../shared/db.js";

interface MoveTrackRequest {
    sourceChannelId?: string;
    destChannelId?: string;
    trackId?: string;
}

interface MoveTrackResult {
    success: true;
    storageFilesCopied: number;
    sourcePlaylistsUpdated: number;
}

const MUSIC_STORAGE_VARIANTS = ['vocal', 'instrumental', 'cover'] as const;
type StorageVariant = typeof MUSIC_STORAGE_VARIANTS[number];

interface TrackStorageField {
    pathField: 'vocalStoragePath' | 'instrumentalStoragePath' | 'coverStoragePath';
    urlField: 'vocalUrl' | 'instrumentalUrl' | 'coverUrl';
}

const STORAGE_FIELDS: Record<StorageVariant, TrackStorageField> = {
    vocal: { pathField: 'vocalStoragePath', urlField: 'vocalUrl' },
    instrumental: { pathField: 'instrumentalStoragePath', urlField: 'instrumentalUrl' },
    cover: { pathField: 'coverStoragePath', urlField: 'coverUrl' },
};

/**
 * Callable Function: Move a track between two of the user's channels. Audio
 * files (vocal, instrumental, optional cover) are copied to dest with new
 * download tokens; source playlist references are removed; source doc and
 * source storage files are deleted.
 */
export const moveTrackToChannel = onCall(
    { timeoutSeconds: 120, memory: "512MiB" },
    async (request): Promise<MoveTrackResult> => {
        if (!request.auth) {
            throw new HttpsError("unauthenticated", "Authentication required.");
        }
        const userId = request.auth.uid;
        const { sourceChannelId, destChannelId, trackId } =
            (request.data ?? {}) as MoveTrackRequest;

        validateRequest({ sourceChannelId, destChannelId, trackId });

        return runTrackMove({
            userId,
            sourceChannelId: sourceChannelId!,
            destChannelId: destChannelId!,
            trackId: trackId!,
        });
    },
);

/**
 * Pure orchestration entry point — split out for tests and CLI scripts.
 */
export async function runTrackMove(args: {
    userId: string;
    sourceChannelId: string;
    destChannelId: string;
    trackId: string;
}): Promise<MoveTrackResult> {
    const { userId, sourceChannelId, destChannelId, trackId } = args;

    await assertSourceAndDestState({ userId, sourceChannelId, destChannelId, trackId });

    const sourceTrack = await readSourceTrack({ userId, sourceChannelId, trackId });

    const storageMigration = await migrateStorageFiles({
        userId,
        sourceChannelId,
        destChannelId,
        trackId,
        sourceTrack,
    });

    await writeDestTrack({
        userId,
        destChannelId,
        trackId,
        sourceTrack,
        storageRewrites: storageMigration.rewrites,
    });

    await verifyDestExists({ userId, destChannelId, trackId });

    const sourcePlaylistsUpdated = await cleanupSourcePlaylists({
        userId, sourceChannelId, trackId,
    });

    await deleteSourceTrack({
        userId,
        sourceChannelId,
        trackId,
        sourceTrack,
    });

    return {
        success: true,
        storageFilesCopied: storageMigration.copied,
        sourcePlaylistsUpdated,
    };
}

// ─── Helpers ───────────────────────────────────────────────────────────

function validateRequest(req: MoveTrackRequest): void {
    if (!req.sourceChannelId || !req.destChannelId || !req.trackId) {
        throw new HttpsError(
            "invalid-argument",
            "sourceChannelId, destChannelId, and trackId are required.",
        );
    }
    if (req.sourceChannelId === req.destChannelId) {
        throw new HttpsError(
            "invalid-argument",
            "sourceChannelId and destChannelId must differ.",
        );
    }
}

async function assertSourceAndDestState(args: {
    userId: string;
    sourceChannelId: string;
    destChannelId: string;
    trackId: string;
}): Promise<void> {
    const { userId, sourceChannelId, destChannelId, trackId } = args;

    const [srcChDoc, dstChDoc] = await Promise.all([
        db.doc(`users/${userId}/channels/${sourceChannelId}`).get(),
        db.doc(`users/${userId}/channels/${destChannelId}`).get(),
    ]);
    if (!srcChDoc.exists) {
        throw new HttpsError("not-found", `Source channel ${sourceChannelId} not found.`);
    }
    if (!dstChDoc.exists) {
        throw new HttpsError("not-found", `Destination channel ${destChannelId} not found.`);
    }

    const [srcTrackDoc, dstTrackDoc] = await Promise.all([
        db.doc(trackPath(userId, sourceChannelId, trackId)).get(),
        db.doc(trackPath(userId, destChannelId, trackId)).get(),
    ]);
    if (!srcTrackDoc.exists) {
        throw new HttpsError("not-found", `Track ${trackId} not found in source channel.`);
    }
    if (dstTrackDoc.exists) {
        throw new HttpsError(
            "already-exists",
            `Track ${trackId} already exists in destination channel — refuse to overwrite.`,
        );
    }
}

interface SourceTrack {
    [key: string]: unknown;
    vocalStoragePath?: string;
    instrumentalStoragePath?: string;
    coverStoragePath?: string;
    vocalUrl?: string;
    instrumentalUrl?: string;
    coverUrl?: string;
}

async function readSourceTrack(args: {
    userId: string;
    sourceChannelId: string;
    trackId: string;
}): Promise<SourceTrack> {
    const { userId, sourceChannelId, trackId } = args;
    const snap = await db.doc(trackPath(userId, sourceChannelId, trackId)).get();
    return snap.data() as SourceTrack;
}

interface StorageRewrite {
    pathField: TrackStorageField['pathField'];
    urlField: TrackStorageField['urlField'];
    newPath: string;
    newUrl: string;
}

/**
 * Copy each present storage file (vocal/instrumental/cover) from source path to
 * the matching dest path. Each copied file gets a fresh
 * `firebaseStorageDownloadTokens` so the new URL is independent from source.
 */
async function migrateStorageFiles(args: {
    userId: string;
    sourceChannelId: string;
    destChannelId: string;
    trackId: string;
    sourceTrack: SourceTrack;
}): Promise<{ copied: number; rewrites: StorageRewrite[] }> {
    const { sourceChannelId, destChannelId, sourceTrack } = args;
    const bucket = admin.storage().bucket();
    const rewrites: StorageRewrite[] = [];

    for (const variant of MUSIC_STORAGE_VARIANTS) {
        const fields = STORAGE_FIELDS[variant];
        const srcPath = sourceTrack[fields.pathField];
        if (typeof srcPath !== 'string' || srcPath.length === 0) continue;

        const destPath = srcPath.replace(
            `/channels/${sourceChannelId}/`,
            `/channels/${destChannelId}/`,
        );
        if (destPath === srcPath) {
            // Path didn't contain the expected channel segment — skip rather than
            // silently produce an identical-path duplicate.
            continue;
        }

        const destFile = bucket.file(destPath);
        await bucket.file(srcPath).copy(destFile);

        const newToken = crypto.randomUUID();
        await destFile.setMetadata({
            metadata: { firebaseStorageDownloadTokens: newToken },
        });

        rewrites.push({
            pathField: fields.pathField,
            urlField: fields.urlField,
            newPath: destPath,
            newUrl: buildFirebaseDownloadUrl(bucket.name, destPath, newToken),
        });
    }

    return { copied: rewrites.length, rewrites };
}

async function writeDestTrack(args: {
    userId: string;
    destChannelId: string;
    trackId: string;
    sourceTrack: SourceTrack;
    storageRewrites: StorageRewrite[];
}): Promise<void> {
    const { userId, destChannelId, trackId, sourceTrack, storageRewrites } = args;

    const destDoc: Record<string, unknown> = { ...sourceTrack };

    // Rewrite storage paths + URLs for each migrated file.
    for (const r of storageRewrites) {
        destDoc[r.pathField] = r.newPath;
        destDoc[r.urlField] = r.newUrl;
    }

    // Clear source-channel-scoped relationships. The track lands as standalone;
    // groups/version-links/video-links exist in the source channel only.
    delete destDoc.groupId;
    delete destDoc.groupOrder;
    delete destDoc.linkedVideoIds;

    // Stamp ownership for the dest channel.
    destDoc.ownerUserId = userId;
    destDoc.ownerChannelId = destChannelId;
    destDoc.id = trackId;
    destDoc.updatedAt = Date.now();

    await db.doc(trackPath(userId, destChannelId, trackId)).set(destDoc);
}

async function verifyDestExists(args: {
    userId: string;
    destChannelId: string;
    trackId: string;
}): Promise<void> {
    const snap = await db.doc(trackPath(args.userId, args.destChannelId, args.trackId)).get();
    if (!snap.exists) {
        throw new HttpsError(
            "internal",
            "Destination track doc not found after write — aborting before source cleanup.",
        );
    }
}

/**
 * Strip every reference to the moved track from source music playlists:
 * removes the trackId from `trackIds`, `trackAddedAt` map, and `trackSources`
 * map. Returns the number of playlist docs that were updated.
 */
async function cleanupSourcePlaylists(args: {
    userId: string;
    sourceChannelId: string;
    trackId: string;
}): Promise<number> {
    const { userId, sourceChannelId, trackId } = args;
    const playlistsRef = db.collection(`users/${userId}/channels/${sourceChannelId}/musicPlaylists`);
    const playlists = await playlistsRef.get();

    const affected = playlists.docs.filter((p) => {
        const ids = (p.data().trackIds as string[] | undefined) ?? [];
        return ids.includes(trackId);
    });
    if (affected.length === 0) return 0;

    const batch = db.batch();
    for (const p of affected) {
        const data = p.data();
        const trackIds = ((data.trackIds as string[]) ?? []).filter((id) => id !== trackId);

        // Strip from optional maps too — { [trackId]: ... }.
        const update: Record<string, unknown> = {
            trackIds,
            updatedAt: Date.now(),
        };

        const trackAddedAt = data.trackAddedAt as Record<string, unknown> | undefined;
        if (trackAddedAt && trackId in trackAddedAt) {
            const next = { ...trackAddedAt };
            delete next[trackId];
            update.trackAddedAt = next;
        }
        const trackSources = data.trackSources as Record<string, unknown> | undefined;
        if (trackSources && trackId in trackSources) {
            const next = { ...trackSources };
            delete next[trackId];
            update.trackSources = next;
        }

        batch.update(p.ref, update);
    }
    await batch.commit();
    return affected.length;
}

async function deleteSourceTrack(args: {
    userId: string;
    sourceChannelId: string;
    trackId: string;
    sourceTrack: SourceTrack;
}): Promise<void> {
    const { userId, sourceChannelId, trackId, sourceTrack } = args;
    const bucket = admin.storage().bucket();

    // Delete each known storage file. Best-effort: we already wrote dest, so
    // a stale leftover in source storage is annoying but not corrupting.
    for (const variant of MUSIC_STORAGE_VARIANTS) {
        const path = sourceTrack[STORAGE_FIELDS[variant].pathField];
        if (typeof path === 'string' && path.length > 0) {
            await bucket.file(path).delete().catch(() => undefined);
        }
    }

    await db.doc(trackPath(userId, sourceChannelId, trackId)).delete();
}

function trackPath(userId: string, channelId: string, trackId: string): string {
    return `users/${userId}/channels/${channelId}/tracks/${trackId}`;
}

function buildFirebaseDownloadUrl(
    bucketName: string,
    storagePath: string,
    token: string,
): string {
    return `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encodeURIComponent(storagePath)}?alt=media&token=${token}`;
}
