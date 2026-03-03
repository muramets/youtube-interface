/**
 * One-time migration: mergedVideoData → root fields
 * Run from functions/:  node /tmp/migrate-merged-video-data.cjs
 */

const admin = require("firebase-admin");

if (!admin.apps.length) {
    admin.initializeApp({ projectId: "mytube-46104" });
}
const db = admin.firestore();
const FieldValue = admin.firestore.FieldValue;

async function migrate() {
    const usersSnap = await db.collection("users").get();
    console.log(`Found ${usersSnap.size} user(s)`);

    let totalMigrated = 0;
    let totalSkipped = 0;

    for (const userDoc of usersSnap.docs) {
        const userId = userDoc.id;
        const channelsSnap = await db
            .collection(`users/${userId}/channels`)
            .get();

        for (const channelDoc of channelsSnap.docs) {
            const channelId = channelDoc.id;
            const videosSnap = await db
                .collection(`users/${userId}/channels/${channelId}/videos`)
                .get();

            for (const videoDoc of videosSnap.docs) {
                const data = videoDoc.data();

                if (!data.mergedVideoData) {
                    totalSkipped++;
                    continue;
                }

                const merged = data.mergedVideoData;
                const update = {
                    mergedVideoData: FieldValue.delete(),
                    fetchStatus: "success",
                };

                if (merged.viewCount) update.viewCount = merged.viewCount;
                if (merged.publishedAt) update.publishedAt = merged.publishedAt;
                if (merged.duration) update.duration = merged.duration;
                if (merged.thumbnail) update.thumbnail = merged.thumbnail;
                if (merged.description !== undefined) update.description = merged.description;
                if (merged.tags) update.tags = merged.tags;

                await videoDoc.ref.update(update);
                totalMigrated++;
                console.log(
                    `  ✅ ${userId}/${channelId}/${videoDoc.id} "${data.title}" — viewCount: ${data.viewCount} → ${merged.viewCount || data.viewCount}`
                );
            }
        }
    }

    console.log(
        `\nDone! Migrated: ${totalMigrated}, Skipped (no mergedVideoData): ${totalSkipped}`
    );
}

migrate().catch((err) => {
    console.error("Migration failed:", err);
    process.exit(1);
});
