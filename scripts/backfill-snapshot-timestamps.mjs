// Usage: node scripts/backfill-snapshot-timestamps.mjs [--write]
//
// One-time migration: reads traffic/main and trafficSource/main for every video,
// finds the latest snapshot timestamp, and writes lastSuggestedTrafficUpload /
// lastTrafficSourceUpload onto the video document.
//
// Dry-run by default — pass --write to actually update Firestore.

import { createRequire } from 'module';
const require = createRequire(new URL('../functions/package.json', import.meta.url).pathname);
const admin = require('firebase-admin');

admin.initializeApp({ projectId: 'mytube-46104' });
const db = admin.firestore();

const shouldWrite = process.argv.includes('--write');

async function run() {
    const usersSnap = await db.collection('users').get();
    let totalVideos = 0;
    let updated = 0;
    let skipped = 0;

    for (const userDoc of usersSnap.docs) {
        const channelsSnap = await db.collection(`users/${userDoc.id}/channels`).get();

        for (const channelDoc of channelsSnap.docs) {
            const basePath = `users/${userDoc.id}/channels/${channelDoc.id}`;
            const videosSnap = await db.collection(`${basePath}/videos`).get();

            for (const videoDoc of videosSnap.docs) {
                totalVideos++;
                const videoData = videoDoc.data();
                const videoPath = `${basePath}/videos/${videoDoc.id}`;
                const updates = {};

                // --- Suggested Traffic (traffic/main) ---
                if (videoData.lastSuggestedTrafficUpload === undefined) {
                    try {
                        const trafficDoc = await db.doc(`${videoPath}/traffic/main`).get();
                        if (trafficDoc.exists) {
                            const snapshots = trafficDoc.data()?.snapshots || [];
                            if (snapshots.length > 0) {
                                const latest = Math.max(...snapshots.map(s => s.timestamp || 0));
                                if (latest > 0) updates.lastSuggestedTrafficUpload = latest;
                            }
                        }
                    } catch (e) {
                        console.warn(`  [WARN] Failed to read traffic/main for ${videoDoc.id}:`, e.message);
                    }
                }

                // --- Traffic Sources (trafficSource/main) ---
                if (videoData.lastTrafficSourceUpload === undefined) {
                    try {
                        const tsDoc = await db.doc(`${videoPath}/trafficSource/main`).get();
                        if (tsDoc.exists) {
                            const snapshots = tsDoc.data()?.snapshots || [];
                            if (snapshots.length > 0) {
                                const latest = Math.max(...snapshots.map(s => s.timestamp || 0));
                                if (latest > 0) updates.lastTrafficSourceUpload = latest;
                            }
                        }
                    } catch (e) {
                        console.warn(`  [WARN] Failed to read trafficSource/main for ${videoDoc.id}:`, e.message);
                    }
                }

                if (Object.keys(updates).length === 0) {
                    skipped++;
                    continue;
                }

                const sugTs = updates.lastSuggestedTrafficUpload
                    ? new Date(updates.lastSuggestedTrafficUpload).toISOString()
                    : '-';
                const tsTs = updates.lastTrafficSourceUpload
                    ? new Date(updates.lastTrafficSourceUpload).toISOString()
                    : '-';
                console.log(`  ${videoDoc.id}: suggested=${sugTs}, trafficSource=${tsTs}`);

                if (shouldWrite) {
                    await db.doc(videoPath).update(updates);
                }
                updated++;
            }
        }
    }

    console.log(`\n--- Summary ---`);
    console.log(`Total videos: ${totalVideos}`);
    console.log(`Updated: ${updated}`);
    console.log(`Skipped (already has timestamps): ${skipped}`);
    if (!shouldWrite && updated > 0) {
        console.log(`\nDry run — no changes written. Pass --write to apply.`);
    }
}

run().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
