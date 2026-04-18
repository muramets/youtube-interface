// Usage: node scripts/cleanup-checkin-notifications.mjs [--write]
//
// Deletes ALL check-in notifications from Firestore across all users/channels.
// After deletion, the scheduler on next tick (within 60s) will recreate only
// notifications that are actually due under the current dueTime logic.
//
// Dry-run by default — pass --write to actually delete.

import { createRequire } from 'module';
const require = createRequire(new URL('../functions/package.json', import.meta.url).pathname);
const admin = require('firebase-admin');
admin.initializeApp({ projectId: 'mytube-46104' });
const db = admin.firestore();

const shouldWrite = process.argv.includes('--write');

(async () => {
    const usersSnap = await db.collection('users').get();
    let totalFound = 0;
    let totalDeleted = 0;

    for (const userDoc of usersSnap.docs) {
        const channelsSnap = await db.collection(`users/${userDoc.id}/channels`).get();
        for (const channelDoc of channelsSnap.docs) {
            const notifsSnap = await db.collection(`users/${userDoc.id}/channels/${channelDoc.id}/notifications`).get();
            const checkinNotifs = notifsSnap.docs.filter(d => {
                const data = d.data();
                return data.category === 'checkin' || (data.internalId && data.internalId.startsWith('checkin-due-'));
            });

            if (checkinNotifs.length === 0) continue;
            totalFound += checkinNotifs.length;
            console.log(`  ${userDoc.id}/${channelDoc.id}: ${checkinNotifs.length} check-in notifications`);
            checkinNotifs.forEach(d => console.log(`    - ${d.data().internalId || d.id}`));

            if (shouldWrite) {
                const batch = db.batch();
                checkinNotifs.forEach(d => batch.delete(d.ref));
                await batch.commit();
                totalDeleted += checkinNotifs.length;
            }
        }
    }

    console.log(`\n--- Summary ---`);
    console.log(`Found: ${totalFound} check-in notifications`);
    console.log(`Deleted: ${totalDeleted}`);
    if (!shouldWrite && totalFound > 0) {
        console.log(`\nDry run — no changes written. Pass --write to apply.`);
    }
})().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
