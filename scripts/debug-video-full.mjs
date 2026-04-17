// Usage: node scripts/debug-video-full.mjs <videoId>
import { createRequire } from 'module';
const require = createRequire(new URL('../functions/package.json', import.meta.url).pathname);
const admin = require('firebase-admin');
admin.initializeApp({ projectId: 'mytube-46104' });
const db = admin.firestore();

const videoId = process.argv[2];
if (!videoId) { console.error('Usage: node scripts/debug-video-full.mjs <videoId>'); process.exit(1); }

(async () => {
    const users = await db.collection('users').get();
    for (const u of users.docs) {
        const channels = await db.collection(`users/${u.id}/channels`).get();
        for (const c of channels.docs) {
            const doc = await db.doc(`users/${u.id}/channels/${c.id}/videos/${videoId}`).get();
            if (!doc.exists) continue;
            const d = doc.data();
            console.log(`\n=== Full video data: ${videoId} ===`);
            Object.entries(d).forEach(([k, v]) => {
                if (typeof v === 'string' && v.length > 200) v = v.slice(0, 200) + '...';
                if (Array.isArray(v)) v = `Array(${v.length})`;
                if (typeof v === 'object' && v !== null) v = JSON.stringify(v).slice(0, 150);
                console.log(`  ${k}: ${v}`);
            });
            process.exit(0);
        }
    }
    console.log('Video not found');
})().catch(e => { console.error(e); process.exit(1); });
