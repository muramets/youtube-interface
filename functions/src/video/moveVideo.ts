/**
 * video/moveVideo.ts — Transfer a video document tree (Copy or Move) between two
 * user channels.
 *
 * Atomicity strategy: write everything to dest first, verify; for `mode: 'move'`
 * then delete source + clean source playlists. If anything fails mid-way, source
 * remains intact and dest may be partial. Recovery = delete partial dest manually
 * and re-run.
 *
 * Subcollections are discovered via listCollections() so future additions
 * (e.g. comments/, renders/) are migrated automatically.
 */
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { admin, db } from "../shared/db.js";
import { planVideoMigration } from "../shared/videoMigration.js";
import type { SubcollectionDocs, DocData } from "../shared/videoMigration.js";

export type TransferMode = 'copy' | 'move';

interface MoveVideoRequest {
    sourceChannelId?: string;
    destChannelId?: string;
    videoId?: string;
    mode?: TransferMode;
}

interface MoveVideoResult {
    success: true;
    mode: TransferMode;
    docsCopied: number;
    storageFilesCopied: number;
    /** Source playlists whose videoIds were modified — only on `mode: 'move'`. */
    playlistsUpdated: number;
    /** Target playlists newly created to mirror source playlist membership. */
    targetPlaylistsCreated: number;
    /** Target playlists where the transferred video was appended to existing videoIds. */
    targetPlaylistsUpdated: number;
}

const VIDEO_ORDER_DOC = "videoOrder";

/**
 * Callable Function: Transfer a video (with all snapshots, traffic data, custom
 * thumbnail, storage files, and videoOrder position) between two of the user's
 * channels.
 *
 * - `mode: 'move'` (default, backward compatible): source video tree and storage
 *   files are deleted after dest is verified, source playlists referencing the
 *   video are cleaned up.
 * - `mode: 'copy'`: source remains untouched. Dest playlists are NOT auto-updated
 *   in either mode.
 */
export const moveVideoToChannel = onCall(
    { timeoutSeconds: 120, memory: "512MiB" },
    async (request): Promise<MoveVideoResult> => {
        if (!request.auth) {
            throw new HttpsError("unauthenticated", "Authentication required.");
        }
        const userId = request.auth.uid;
        const { sourceChannelId, destChannelId, videoId, mode } =
            (request.data ?? {}) as MoveVideoRequest;

        validateRequest({ sourceChannelId, destChannelId, videoId, mode });

        return runMove({
            userId,
            sourceChannelId: sourceChannelId!,
            destChannelId: destChannelId!,
            videoId: videoId!,
            mode: mode ?? 'move',
        });
    },
);

/**
 * Pure orchestration entry point — split out so it can be exercised from tests
 * and CLI scripts without going through the onCall wrapper.
 */
export async function runMove(args: {
    userId: string;
    sourceChannelId: string;
    destChannelId: string;
    videoId: string;
    mode?: TransferMode;
}): Promise<MoveVideoResult> {
    const { userId, sourceChannelId, destChannelId, videoId } = args;
    const mode: TransferMode = args.mode ?? 'move';

    await assertSourceAndDestState({ userId, sourceChannelId, destChannelId, videoId });

    const tree = await readSourceVideoTree({ userId, sourceChannelId, videoId });
    const plan = planVideoMigration({
        sourceChannelId,
        destChannelId,
        mainDoc: tree.mainDoc,
        subcollections: tree.subcollections,
    });

    // Mirror source's Home placement. If the source video was Home-visible
    // (`isPlaylistOnly` falsy), surface it on target Home with a fresh
    // `addedToHomeAt` so it appears at the top. If the source was
    // playlist-only, target stays playlist-only — the video will surface in
    // the mirrored target playlists, not on Home.
    const sourceIsPlaylistOnly = tree.mainDoc.isPlaylistOnly === true;
    plan.mainDoc.isPlaylistOnly = sourceIsPlaylistOnly;
    if (!sourceIsPlaylistOnly) {
        plan.mainDoc.addedToHomeAt = Date.now();
    }

    await writeDestVideoTree({ userId, destChannelId, videoId, plan });
    const storageFilesCopied = await copyStorageFiles({
        userId, sourceChannelId, destChannelId, videoId,
    });
    await updateVideoOrders({ userId, sourceChannelId, destChannelId, videoId, mode });
    await verifyDestExists({ userId, destChannelId, videoId });

    const playlistMirror = await mirrorPlaylistMembership({
        userId, sourceChannelId, destChannelId, videoId,
    });

    let playlistsUpdated = 0;
    if (mode === 'move') {
        await deleteSourceTree({ userId, sourceChannelId, videoId });
        playlistsUpdated = await cleanupSourcePlaylists({
            userId, sourceChannelId, videoId,
        });
    }

    const docsCopied = 1 + Object.values(plan.subcollections)
        .reduce((acc, sub) => acc + Object.keys(sub).length, 0);

    return {
        success: true,
        mode,
        docsCopied,
        storageFilesCopied,
        playlistsUpdated,
        targetPlaylistsCreated: playlistMirror.created,
        targetPlaylistsUpdated: playlistMirror.updated,
    };
}

// ─── Helpers ───────────────────────────────────────────────────────────

function validateRequest(req: MoveVideoRequest): void {
    if (!req.sourceChannelId || !req.destChannelId || !req.videoId) {
        throw new HttpsError(
            "invalid-argument",
            "sourceChannelId, destChannelId, and videoId are required.",
        );
    }
    if (req.sourceChannelId === req.destChannelId) {
        throw new HttpsError(
            "invalid-argument",
            "sourceChannelId and destChannelId must differ.",
        );
    }
    if (req.mode !== undefined && req.mode !== 'copy' && req.mode !== 'move') {
        throw new HttpsError(
            "invalid-argument",
            `mode must be 'copy' or 'move' (got ${String(req.mode)}).`,
        );
    }
}

async function assertSourceAndDestState(args: {
    userId: string;
    sourceChannelId: string;
    destChannelId: string;
    videoId: string;
}): Promise<void> {
    const { userId, sourceChannelId, destChannelId, videoId } = args;

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

    const [srcVideoDoc, dstVideoDoc] = await Promise.all([
        db.doc(videoPath(userId, sourceChannelId, videoId)).get(),
        db.doc(videoPath(userId, destChannelId, videoId)).get(),
    ]);
    if (!srcVideoDoc.exists) {
        throw new HttpsError("not-found", `Video ${videoId} not found in source channel.`);
    }
    if (dstVideoDoc.exists) {
        throw new HttpsError(
            "already-exists",
            `Video ${videoId} already exists in destination channel — refuse to overwrite.`,
        );
    }
}

async function readSourceVideoTree(args: {
    userId: string;
    sourceChannelId: string;
    videoId: string;
}): Promise<{ mainDoc: DocData; subcollections: SubcollectionDocs }> {
    const { userId, sourceChannelId, videoId } = args;
    const videoRef = db.doc(videoPath(userId, sourceChannelId, videoId));

    const mainSnap = await videoRef.get();
    const mainDoc = mainSnap.data() as DocData;

    const subRefs = await videoRef.listCollections();
    const subcollections: SubcollectionDocs = {};

    for (const subRef of subRefs) {
        const docs = await subRef.get();
        const docMap: { [docId: string]: DocData } = {};
        for (const d of docs.docs) {
            docMap[d.id] = d.data() as DocData;
        }
        subcollections[subRef.id] = docMap;
    }

    return { mainDoc, subcollections };
}

async function writeDestVideoTree(args: {
    userId: string;
    destChannelId: string;
    videoId: string;
    plan: ReturnType<typeof planVideoMigration>;
}): Promise<void> {
    const { userId, destChannelId, videoId, plan } = args;
    const batch = db.batch();
    const videoRef = db.doc(videoPath(userId, destChannelId, videoId));

    batch.set(videoRef, plan.mainDoc);

    for (const [subName, docs] of Object.entries(plan.subcollections)) {
        for (const [docId, docData] of Object.entries(docs)) {
            const subDocRef = videoRef.collection(subName).doc(docId);
            batch.set(subDocRef, docData);
        }
    }

    await batch.commit();
}

async function copyStorageFiles(args: {
    userId: string;
    sourceChannelId: string;
    destChannelId: string;
    videoId: string;
}): Promise<number> {
    const { userId, sourceChannelId, destChannelId, videoId } = args;
    const bucket = admin.storage().bucket();
    const srcPrefix = `users/${userId}/channels/${sourceChannelId}/videos/${videoId}/`;

    const [files] = await bucket.getFiles({ prefix: srcPrefix });
    if (files.length === 0) return 0;

    await Promise.all(files.map((file) => {
        const destName = file.name.replace(
            `/channels/${sourceChannelId}/`,
            `/channels/${destChannelId}/`,
        );
        return file.copy(bucket.file(destName));
    }));

    return files.length;
}

async function updateVideoOrders(args: {
    userId: string;
    sourceChannelId: string;
    destChannelId: string;
    videoId: string;
    mode: TransferMode;
}): Promise<void> {
    const { userId, sourceChannelId, destChannelId, videoId, mode } = args;

    const srcRef = db.doc(`users/${userId}/channels/${sourceChannelId}/settings/${VIDEO_ORDER_DOC}`);
    const dstRef = db.doc(`users/${userId}/channels/${destChannelId}/settings/${VIDEO_ORDER_DOC}`);

    await db.runTransaction(async (tx) => {
        const [srcSnap, dstSnap] = await Promise.all([tx.get(srcRef), tx.get(dstRef)]);

        // Only remove from source order on move — copy keeps the video in source.
        if (mode === 'move' && srcSnap.exists) {
            const srcOrder = (srcSnap.data()?.order as string[] | undefined) ?? [];
            const filtered = srcOrder.filter((id) => id !== videoId);
            if (filtered.length !== srcOrder.length) {
                tx.update(srcRef, { order: filtered });
            }
        }

        const dstOrder = dstSnap.exists
            ? ((dstSnap.data()?.order as string[] | undefined) ?? [])
            : [];
        if (!dstOrder.includes(videoId)) {
            tx.set(dstRef, { order: [...dstOrder, videoId] }, { merge: true });
        }
    });
}

async function verifyDestExists(args: {
    userId: string;
    destChannelId: string;
    videoId: string;
}): Promise<void> {
    const { userId, destChannelId, videoId } = args;
    const dstRef = db.doc(videoPath(userId, destChannelId, videoId));
    const snap = await dstRef.get();
    if (!snap.exists) {
        throw new HttpsError(
            "internal",
            "Destination video doc not found after write — aborting before source cleanup.",
        );
    }
}

async function deleteSourceTree(args: {
    userId: string;
    sourceChannelId: string;
    videoId: string;
}): Promise<void> {
    const { userId, sourceChannelId, videoId } = args;
    const bucket = admin.storage().bucket();
    const srcPrefix = `users/${userId}/channels/${sourceChannelId}/videos/${videoId}/`;

    // Storage files
    const [files] = await bucket.getFiles({ prefix: srcPrefix });
    await Promise.all(files.map((f) => f.delete().catch(() => undefined)));

    // Subcollections
    const videoRef = db.doc(videoPath(userId, sourceChannelId, videoId));
    const subRefs = await videoRef.listCollections();
    for (const subRef of subRefs) {
        const docs = await subRef.get();
        const batch = db.batch();
        docs.docs.forEach((d) => batch.delete(d.ref));
        if (!docs.empty) await batch.commit();
    }

    // Main doc
    await videoRef.delete();
}

/**
 * For each source playlist that contains the transferred video, ensure a
 * matching target playlist exists with the video appended to its videoIds.
 *
 * Source-of-truth for matching is the playlist ID (UUID). If target already
 * has a playlist with the same ID, the videoId is appended (deduped). If not,
 * a new playlist doc is created at the same ID, copying name/coverImage/group
 * from source but resetting videoIds to just the transferred video — only
 * THIS video is being transferred, not the rest of the source playlist.
 *
 * This runs in both copy and move modes. In move mode, source playlist
 * membership is then cleaned up by `cleanupSourcePlaylists`.
 */
async function mirrorPlaylistMembership(args: {
    userId: string;
    sourceChannelId: string;
    destChannelId: string;
    videoId: string;
}): Promise<{ created: number; updated: number }> {
    const { userId, sourceChannelId, destChannelId, videoId } = args;

    const sourcePlaylistsRef = db.collection(`users/${userId}/channels/${sourceChannelId}/playlists`);
    const sourcePlaylists = await sourcePlaylistsRef.get();
    const containing = sourcePlaylists.docs.filter((p) => {
        const ids = (p.data().videoIds as string[] | undefined) ?? [];
        return ids.includes(videoId);
    });

    if (containing.length === 0) return { created: 0, updated: 0 };

    let created = 0;
    let updated = 0;

    for (const sp of containing) {
        const destRef = db.doc(`users/${userId}/channels/${destChannelId}/playlists/${sp.id}`);
        const destSnap = await destRef.get();

        if (destSnap.exists) {
            const existingIds = (destSnap.data()?.videoIds as string[] | undefined) ?? [];
            if (!existingIds.includes(videoId)) {
                await destRef.update({
                    videoIds: [...existingIds, videoId],
                    updatedAt: Date.now(),
                });
                updated++;
            }
            continue;
        }

        // Copy playlist metadata but only this video. The rest of the source
        // playlist's videos stay in source — we're transferring one video.
        const data = sp.data();
        const { videoIds: _drop, ...meta } = data as { videoIds?: string[]; [k: string]: unknown };
        void _drop;
        await destRef.set({
            ...meta,
            id: sp.id,
            videoIds: [videoId],
            createdAt: data.createdAt ?? Date.now(),
            updatedAt: Date.now(),
        });
        created++;
    }

    return { created, updated };
}

async function cleanupSourcePlaylists(args: {
    userId: string;
    sourceChannelId: string;
    videoId: string;
}): Promise<number> {
    const { userId, sourceChannelId, videoId } = args;
    const playlistsRef = db.collection(`users/${userId}/channels/${sourceChannelId}/playlists`);
    const playlists = await playlistsRef.get();

    const affected = playlists.docs.filter((p) => {
        const ids = (p.data().videoIds as string[] | undefined) ?? [];
        return ids.includes(videoId);
    });

    if (affected.length === 0) return 0;

    const batch = db.batch();
    for (const p of affected) {
        const ids = (p.data().videoIds as string[]) ?? [];
        batch.update(p.ref, { videoIds: ids.filter((id) => id !== videoId) });
    }
    await batch.commit();
    return affected.length;
}

function videoPath(userId: string, channelId: string, videoId: string): string {
    return `users/${userId}/channels/${channelId}/videos/${videoId}`;
}
