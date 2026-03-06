// Usage: node scripts/read-conversation.mjs <conversationPath>
// Example: node scripts/read-conversation.mjs users/UID/channels/CID/chatConversations/CONV_ID/messages
//
// Reads all messages from a Firestore conversation and prints tool call details.
// Requires: firebase-admin (resolved from functions/ dir)

import { createRequire } from 'module';
const require = createRequire(new URL('../functions/package.json', import.meta.url).pathname);
const admin = require('firebase-admin');

admin.initializeApp({ projectId: 'mytube-46104' });
const db = admin.firestore();

const path = process.argv[2];
if (!path) {
    console.error('Usage: node scripts/read-conversation.mjs <firestorePath>');
    process.exit(1);
}

const snap = await db.collection(path).orderBy('createdAt').get();

for (const doc of snap.docs) {
    const d = doc.data();
    const tc = d.toolCalls;
    console.log('---');
    console.log(`role: ${d.role} | text length: ${(d.text || '').length}`);
    if (tc && tc.length) {
        for (const t of tc) {
            const hasResult = t.result != null;
            console.log(`  tool: ${t.name} | has result: ${hasResult}`);
            if (t.result) {
                console.log(`    result keys: ${Object.keys(t.result).join(', ')}`);
            }
        }
    }
}

process.exit(0);
