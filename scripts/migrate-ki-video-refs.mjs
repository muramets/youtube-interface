// Usage: node scripts/migrate-ki-video-refs.mjs <basePath>
// Example: node scripts/migrate-ki-video-refs.mjs users/UID/channels/CID
//
// One-time migration: converts raw video IDs in KI content to [title](vid://ID) links.
// Uses resolvedVideoRefs already stored on each KI doc.
// Dry-run by default — pass --write to actually update Firestore.

import { createRequire } from 'module';
const require = createRequire(new URL('../functions/package.json', import.meta.url).pathname);
const admin = require('firebase-admin');

admin.initializeApp({ projectId: 'mytube-46104' });
const db = admin.firestore();

const basePath = process.argv[2];
const shouldWrite = process.argv.includes('--write');

if (!basePath) {
    console.error('Usage: node scripts/migrate-ki-video-refs.mjs <basePath> [--write]');
    console.error('Example: node scripts/migrate-ki-video-refs.mjs users/UID/channels/CID');
    process.exit(1);
}

// Same logic as src/features/Knowledge/utils/linkifyVideoRefs.ts
function linkifyVideoRefs(markdown, videoMap) {
    if (videoMap.size === 0) return markdown;
    const ids = Array.from(videoMap.keys()).sort((a, b) => b.length - a.length);
    const escapedIds = ids.map(id => id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
    const pattern = new RegExp(
        `\\[[^\\]]*\\]\\([^)]*\\)|(?<![\\w/-])(${escapedIds})(?![\\w/-])`,
        'g'
    );
    return markdown.replace(pattern, (fullMatch, capturedId) => {
        if (!capturedId) return fullMatch;
        const video = videoMap.get(capturedId);
        const title = video?.title || capturedId;
        return `[${title}](vid://${capturedId})`;
    });
}

// Load all channel videos as fallback (for IDs not in resolvedVideoRefs)
const videosSnap = await db.collection(`${basePath}/videos`).get();
const channelVideoMap = new Map();
for (const vDoc of videosSnap.docs) {
    const v = vDoc.data();
    // Custom videos without successful fetch have fake 1M viewCount — don't include
    const hasRealData = !v.isCustom || v.fetchStatus === 'success';
    const entry = {
        videoId: vDoc.id,
        title: v.title || vDoc.id,
        thumbnailUrl: v.thumbnail || '',
        viewCount: hasRealData && v.viewCount ? Number(v.viewCount) : undefined,
        publishedAt: hasRealData ? (v.publishedAt || undefined) : undefined,
        ownership: v.isDraft ? 'own-draft' : 'own-published',
    };
    channelVideoMap.set(vDoc.id, entry);
    if (v.publishedVideoId && v.publishedVideoId !== vDoc.id) {
        channelVideoMap.set(v.publishedVideoId, entry);
    }
}
console.log(`Loaded ${videosSnap.size} own videos`);

// Load trend channel videos (competitors)
const trendChannelsSnap = await db.collection(`${basePath}/trendChannels`).get();
let trendVideoCount = 0;
for (const chDoc of trendChannelsSnap.docs) {
    const chData = chDoc.data();
    const channelTitle = chData.title || chDoc.id;
    const trendVideosSnap = await db.collection(`${basePath}/trendChannels/${chDoc.id}/videos`).get();
    for (const vDoc of trendVideosSnap.docs) {
        if (channelVideoMap.has(vDoc.id)) continue; // own video takes priority
        const v = vDoc.data();
        channelVideoMap.set(vDoc.id, {
            videoId: vDoc.id,
            title: v.title || vDoc.id,
            thumbnailUrl: v.thumbnail || '',
            viewCount: v.viewCount || undefined,
            publishedAt: v.publishedAt || undefined,
            ownership: 'competitor',
            channelTitle,
        });
        trendVideoCount++;
    }
}
console.log(`Loaded ${trendVideoCount} trend videos from ${trendChannelsSnap.size} channels\n`);

const snap = await db.collection(`${basePath}/knowledgeItems`).get();
console.log(`Found ${snap.size} KI documents\n`);

let updated = 0;

for (const doc of snap.docs) {
    const data = doc.data();

    // Build videoMap: resolvedVideoRefs (primary) + channel videos (fallback)
    const videoMap = new Map(channelVideoMap);
    const refs = data.resolvedVideoRefs;
    if (refs) {
        for (const ref of refs) {
            videoMap.set(ref.videoId, ref);
        }
    }

    const original = data.content;
    const migrated = linkifyVideoRefs(original, videoMap);

    // Sync resolvedVideoRefs metrics with channel videos (strips fake 1M, adds real metrics)
    let enrichedRefs = refs;
    if (refs) {
        enrichedRefs = refs.map(ref => {
            const rich = channelVideoMap.get(ref.videoId);
            if (!rich) return ref;
            const { viewCount, publishedAt, ...rest } = ref;
            void viewCount; void publishedAt;
            return { ...rest, viewCount: rich.viewCount, publishedAt: rich.publishedAt };
        });
    }

    const contentChanged = migrated !== original;
    const refsChanged = enrichedRefs !== refs;

    if (!contentChanged && !refsChanged) {
        console.log(`[OK]   ${doc.id} — "${data.title.slice(0, 50)}" — no changes needed`);
        continue;
    }

    // Count replacements
    const vidLinks = migrated.match(/\[.*?\]\(vid:\/\/.*?\)/g) || [];
    const originalVidLinks = original.match(/\[.*?\]\(vid:\/\/.*?\)/g) || [];
    const newLinks = vidLinks.length - originalVidLinks.length;

    const updates = {};
    if (contentChanged) updates.content = migrated;
    if (refsChanged) updates.resolvedVideoRefs = enrichedRefs;

    const parts = [];
    if (contentChanged) parts.push(`${newLinks} raw IDs → vid://`);
    if (refsChanged) parts.push('refs enriched with metrics');

    if (shouldWrite) {
        await doc.ref.update(updates);
        console.log(`[WRITE] ${doc.id} — "${data.title.slice(0, 50)}" — ${parts.join(', ')}`);
    } else {
        console.log(`[DRY]  ${doc.id} — "${data.title.slice(0, 50)}" — ${parts.join(', ')}`);
    }
    updated++;
}

console.log(`\nDone. ${updated}/${snap.size} documents ${shouldWrite ? 'updated' : 'would be updated'}.`);
if (!shouldWrite && updated > 0) {
    console.log('Run with --write to apply changes.');
}
