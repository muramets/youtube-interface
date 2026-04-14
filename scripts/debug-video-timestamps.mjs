// Usage: node scripts/debug-video-timestamps.mjs <videoId>
import { createRequire } from 'module';
const require = createRequire(new URL('../functions/package.json', import.meta.url).pathname);
const admin = require('firebase-admin');

admin.initializeApp({ projectId: 'mytube-46104' });
const db = admin.firestore();

const videoId = process.argv[2];
if (!videoId) { console.error('Usage: node scripts/debug-video-timestamps.mjs <videoId>'); process.exit(1); }

(async () => {
    const users = await db.collection('users').get();
    for (const u of users.docs) {
        const channels = await db.collection(`users/${u.id}/channels`).get();
        for (const c of channels.docs) {
            const path = `users/${u.id}/channels/${c.id}/videos/${videoId}`;
            const doc = await db.doc(path).get();
            if (!doc.exists) continue;

            const d = doc.data();
            console.log(`\n=== ${path} ===`);
            console.log('publishedAt:', d.publishedAt);
            console.log('lastTrafficSourceUpload:', d.lastTrafficSourceUpload ?? 'MISSING', d.lastTrafficSourceUpload ? `(${new Date(d.lastTrafficSourceUpload).toISOString()})` : '');
            console.log('lastSuggestedTrafficUpload:', d.lastSuggestedTrafficUpload ?? 'MISSING', d.lastSuggestedTrafficUpload ? `(${new Date(d.lastSuggestedTrafficUpload).toISOString()})` : '');
            console.log('trafficSourceSnapshotCount:', d.trafficSourceSnapshotCount ?? 0);
            console.log('suggestedTrafficSnapshotCount:', d.suggestedTrafficSnapshotCount ?? 0);

            const tsDoc = await db.doc(`${path}/trafficSource/main`).get();
            if (tsDoc.exists) {
                const snaps = tsDoc.data().snapshots || [];
                console.log(`\nTrafficSource snapshots (${snaps.length}):`);
                snaps.forEach(s => console.log(`  ${s.id} → ${new Date(s.timestamp).toISOString()}`));
            } else {
                console.log('\nTrafficSource: NO DATA');
            }

            const tDoc = await db.doc(`${path}/traffic/main`).get();
            if (tDoc.exists) {
                const snaps = tDoc.data().snapshots || [];
                console.log(`\nSuggestedTraffic snapshots (${snaps.length}):`);
                snaps.forEach(s => console.log(`  ${s.id} → ${new Date(s.timestamp).toISOString()}`));
            } else {
                console.log('\nSuggestedTraffic: NO DATA');
            }
            process.exit(0);
        }
    }
    console.log('Video not found');
})().catch(e => { console.error(e); process.exit(1); });
