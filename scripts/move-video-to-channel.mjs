// Usage:
//   1. Build functions: cd functions && npm run build
//   2. Run dry inspection (default):
//      node scripts/move-video-to-channel.mjs <userId> <sourceChannelId> <destChannelId> <videoId>
//   3. Execute the move:
//      node scripts/move-video-to-channel.mjs <userId> <sourceChannelId> <destChannelId> <videoId> --execute
//
// One-off CLI for moving a video document tree (main doc, subcollections,
// storage files, videoOrder, source playlist references) between two of the
// user's internal channels.
//
// Single source of truth: imports runMove from the compiled Cloud Function so
// the algorithm cannot drift between this script and the deployed function.

import { createRequire } from 'module';
import { pathToFileURL } from 'url';
import { resolve } from 'path';

const require = createRequire(new URL('../functions/package.json', import.meta.url).pathname);
const admin = require('firebase-admin');

admin.initializeApp({
    projectId: 'mytube-46104',
    storageBucket: 'mytube-46104.firebasestorage.app',
});

const [userId, sourceChannelId, destChannelId, videoId, ...flags] = process.argv.slice(2);
const execute = flags.includes('--execute');

if (!userId || !sourceChannelId || !destChannelId || !videoId) {
    console.error('Usage: node scripts/move-video-to-channel.mjs <userId> <sourceChannelId> <destChannelId> <videoId> [--execute]');
    process.exit(1);
}

const db = admin.firestore();
const bucket = admin.storage().bucket();

async function inspect() {
    const srcVideoRef = db.doc(`users/${userId}/channels/${sourceChannelId}/videos/${videoId}`);
    const dstVideoRef = db.doc(`users/${userId}/channels/${destChannelId}/videos/${videoId}`);

    const [srcCh, dstCh, srcVideo, dstVideo] = await Promise.all([
        db.doc(`users/${userId}/channels/${sourceChannelId}`).get(),
        db.doc(`users/${userId}/channels/${destChannelId}`).get(),
        srcVideoRef.get(),
        dstVideoRef.get(),
    ]);

    if (!srcCh.exists) throw new Error(`Source channel not found: ${sourceChannelId}`);
    if (!dstCh.exists) throw new Error(`Dest channel not found: ${destChannelId}`);
    if (!srcVideo.exists) throw new Error(`Source video not found: ${videoId}`);
    if (dstVideo.exists) throw new Error(`Dest video already exists: ${videoId}`);

    const subRefs = await srcVideoRef.listCollections();
    const subStats = [];
    for (const subRef of subRefs) {
        const docs = await subRef.get();
        subStats.push({ name: subRef.id, docCount: docs.size });
    }

    const [files] = await bucket.getFiles({
        prefix: `users/${userId}/channels/${sourceChannelId}/videos/${videoId}/`,
    });

    const playlists = await db.collection(`users/${userId}/channels/${sourceChannelId}/playlists`).get();
    const playlistsWithVideo = playlists.docs.filter((p) =>
        Array.isArray(p.data().videoIds) && p.data().videoIds.includes(videoId),
    );

    return {
        srcChannelTitle: srcCh.data().title || srcCh.data().name || '(no title)',
        dstChannelTitle: dstCh.data().title || dstCh.data().name || '(no title)',
        videoTitle: srcVideo.data().title || '(no title)',
        subcollections: subStats,
        storageFileCount: files.length,
        playlistRefCount: playlistsWithVideo.length,
    };
}

async function main() {
    console.log('=== Move Video to Channel ===');
    console.log(`User:        ${userId}`);
    console.log(`Source:      ${sourceChannelId}`);
    console.log(`Destination: ${destChannelId}`);
    console.log(`Video:       ${videoId}`);
    console.log(`Mode:        ${execute ? 'EXECUTE' : 'DRY-RUN (inspection only)'}\n`);

    const summary = await inspect();
    console.log(`Source channel:   "${summary.srcChannelTitle}"`);
    console.log(`Dest channel:     "${summary.dstChannelTitle}"`);
    console.log(`Video title:      "${summary.videoTitle}"`);
    console.log(`Subcollections:   ${JSON.stringify(summary.subcollections)}`);
    console.log(`Storage files:    ${summary.storageFileCount}`);
    console.log(`Playlist refs:    ${summary.playlistRefCount}\n`);

    if (!execute) {
        console.log('Dry run only. Re-run with --execute to perform the move.');
        process.exit(0);
    }

    const moveModulePath = resolve(
        new URL('../functions/lib/video/moveVideo.js', import.meta.url).pathname,
    );
    const { runMove } = await import(pathToFileURL(moveModulePath).href);

    console.log('Executing move...');
    const result = await runMove({ userId, sourceChannelId, destChannelId, videoId });
    console.log('Done.');
    console.log(JSON.stringify(result, null, 2));
}

main().catch((err) => {
    console.error('FAILED:', err.message);
    process.exit(1);
});
