#!/usr/bin/env npx tsx
// =============================================================================
// Migration: cached_suggested_traffic_videos/ → cached_external_videos/
//
// Copies all documents from the old collection to the new one, adding:
//   - source: "suggested_traffic"
//   - migratedAt: timestamp
//
// Idempotent: skips documents that already exist in the target collection.
// Does NOT delete source documents — manual cleanup after verification.
//
// Usage:
//   # Set credentials first:
//   export GOOGLE_APPLICATION_CREDENTIALS=/path/to/serviceAccountKey.json
//
//   # Dry run (no writes):
//   npx tsx functions/scripts/migrateSuggestedToExternal.ts --dry-run
//
//   # Execute:
//   npx tsx functions/scripts/migrateSuggestedToExternal.ts
//
//   # Single user (for testing):
//   npx tsx functions/scripts/migrateSuggestedToExternal.ts --user-id=abc123
// =============================================================================

import * as admin from "firebase-admin";

// --- CLI args ----------------------------------------------------------------
const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const USER_ID_FLAG = args.find(a => a.startsWith("--user-id="));
const SINGLE_USER_ID = USER_ID_FLAG?.split("=")[1];

// --- Init --------------------------------------------------------------------
if (!admin.apps.length) {
    admin.initializeApp();
}
const db = admin.firestore();

// --- Constants ---------------------------------------------------------------
const BATCH_LIMIT = 500; // Firestore batch write limit
const SOURCE_COLLECTION = "cached_suggested_traffic_videos";
const TARGET_COLLECTION = "cached_external_videos";

// --- Stats -------------------------------------------------------------------
interface Stats {
    usersProcessed: number;
    channelsProcessed: number;
    totalDocs: number;
    migrated: number;
    skipped: number;
    errors: number;
}

const stats: Stats = {
    usersProcessed: 0,
    channelsProcessed: 0,
    totalDocs: 0,
    migrated: 0,
    skipped: 0,
    errors: 0,
};

// --- Migration logic ---------------------------------------------------------

async function migrateChannel(
    userRef: admin.firestore.DocumentReference,
    channelRef: admin.firestore.DocumentReference,
): Promise<void> {
    const channelPath = channelRef.path;
    const sourcePath = `${channelPath}/${SOURCE_COLLECTION}`;
    const targetPath = `${channelPath}/${TARGET_COLLECTION}`;

    const sourceSnap = await db.collection(sourcePath).get();

    if (sourceSnap.empty) {
        return;
    }

    console.log(`  📂 ${sourcePath}: ${sourceSnap.size} documents`);
    stats.totalDocs += sourceSnap.size;

    // Check which docs already exist in target (batch reads)
    const docIds = sourceSnap.docs.map(d => d.id);
    const existingSet = new Set<string>();

    // Batch check existence (500 per getAll)
    for (let i = 0; i < docIds.length; i += BATCH_LIMIT) {
        const chunk = docIds.slice(i, i + BATCH_LIMIT);
        const refs = chunk.map(id => db.doc(`${targetPath}/${id}`));
        const snaps = await db.getAll(...refs);
        for (const snap of snaps) {
            if (snap.exists) {
                existingSet.add(snap.id);
            }
        }
    }

    const toMigrate = sourceSnap.docs.filter(d => !existingSet.has(d.id));
    const skipped = sourceSnap.size - toMigrate.length;

    if (skipped > 0) {
        console.log(`    ⏭  Skipping ${skipped} (already exist in target)`);
        stats.skipped += skipped;
    }

    if (toMigrate.length === 0) {
        return;
    }

    if (DRY_RUN) {
        console.log(`    🔍 DRY RUN: would migrate ${toMigrate.length} documents`);
        stats.migrated += toMigrate.length;
        return;
    }

    // Batch write
    const now = Date.now();
    for (let i = 0; i < toMigrate.length; i += BATCH_LIMIT) {
        const chunk = toMigrate.slice(i, i + BATCH_LIMIT);
        const batch = db.batch();

        for (const doc of chunk) {
            const data = doc.data();
            batch.set(db.doc(`${targetPath}/${doc.id}`), {
                ...data,
                source: "suggested_traffic",
                migratedAt: now,
            });
        }

        await batch.commit();
        console.log(`    ✅ Committed batch ${Math.floor(i / BATCH_LIMIT) + 1}: ${chunk.length} docs`);
    }

    stats.migrated += toMigrate.length;
    console.log(`    ✅ Migrated ${toMigrate.length} documents`);
}

async function migrateUser(userRef: admin.firestore.DocumentReference): Promise<void> {
    const channelsSnap = await db.collection(`${userRef.path}/channels`).get();

    if (channelsSnap.empty) {
        return;
    }

    console.log(`\n👤 User: ${userRef.id} (${channelsSnap.size} channels)`);
    stats.usersProcessed++;

    for (const channelDoc of channelsSnap.docs) {
        stats.channelsProcessed++;
        try {
            await migrateChannel(userRef, channelDoc.ref);
        } catch (err) {
            stats.errors++;
            console.error(`  ❌ Error migrating ${channelDoc.ref.path}:`, err);
        }
    }
}

async function main(): Promise<void> {
    console.log("=".repeat(60));
    console.log(`Cache Consolidation Migration`);
    console.log(`${SOURCE_COLLECTION} → ${TARGET_COLLECTION}`);
    if (DRY_RUN) console.log("⚠️  DRY RUN MODE — no writes will be made");
    if (SINGLE_USER_ID) console.log(`🎯 Single user mode: ${SINGLE_USER_ID}`);
    console.log("=".repeat(60));

    const startTime = Date.now();

    if (SINGLE_USER_ID) {
        const userRef = db.doc(`users/${SINGLE_USER_ID}`);
        const userDoc = await userRef.get();
        if (!userDoc.exists) {
            console.error(`❌ User ${SINGLE_USER_ID} not found`);
            process.exit(1);
        }
        await migrateUser(userRef);
    } else {
        const usersSnap = await db.collection("users").get();
        console.log(`Found ${usersSnap.size} users\n`);

        for (const userDoc of usersSnap.docs) {
            await migrateUser(userDoc.ref);
        }
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

    console.log("\n" + "=".repeat(60));
    console.log("Migration Complete");
    console.log("=".repeat(60));
    console.log(`  Users processed:    ${stats.usersProcessed}`);
    console.log(`  Channels processed: ${stats.channelsProcessed}`);
    console.log(`  Total source docs:  ${stats.totalDocs}`);
    console.log(`  Migrated:           ${stats.migrated}`);
    console.log(`  Skipped (existing): ${stats.skipped}`);
    console.log(`  Errors:             ${stats.errors}`);
    console.log(`  Time:               ${elapsed}s`);
    if (DRY_RUN) console.log("\n⚠️  This was a DRY RUN — no data was written");
    console.log("=".repeat(60));

    process.exit(stats.errors > 0 ? 1 : 0);
}

main().catch(err => {
    console.error("Fatal error:", err);
    process.exit(1);
});
