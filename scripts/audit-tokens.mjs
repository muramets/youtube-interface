// Usage: node scripts/audit-tokens.mjs <conversationPath>
// Reads conversation + all messages, shows exact token data per message.

import { createRequire } from 'module';
const require = createRequire(new URL('../functions/package.json', import.meta.url).pathname);
const admin = require('firebase-admin');

admin.initializeApp({ projectId: 'mytube-46104' });
const db = admin.firestore();

const convPath = process.argv[2];
if (!convPath) {
    console.error('Usage: node scripts/audit-tokens.mjs <conversationPath>');
    console.error('Example: node scripts/audit-tokens.mjs users/UID/channels/CID/chatConversations/CONV_ID');
    process.exit(1);
}

// 1. Read conversation document
const convDoc = await db.doc(convPath).get();
if (!convDoc.exists) {
    console.error(`Conversation not found: ${convPath}`);
    process.exit(1);
}
const conv = convDoc.data();
console.log('=== CONVERSATION METADATA ===');
console.log(`Model: ${conv.model}`);
console.log(`Title: ${conv.title}`);
console.log(`Created: ${conv.createdAt?.toDate?.()?.toISOString() ?? conv.createdAt}`);
if (conv.persistedContext) {
    console.log(`Persisted context items: ${JSON.stringify(conv.persistedContext).length} chars`);
}
console.log('');

// 2. Read all messages
const snap = await db.collection(`${convPath}/messages`).orderBy('createdAt').get();
console.log(`=== ${snap.docs.length} MESSAGES ===\n`);

let totalTextChars = 0;
let totalToolArgChars = 0;
let totalToolResultChars = 0;

for (let idx = 0; idx < snap.docs.length; idx++) {
    const d = snap.docs[idx].data();
    const textLen = (d.text || '').length;
    totalTextChars += textLen;

    const toolCalls = d.toolCalls || [];
    let msgToolArgChars = 0;
    let msgToolResultChars = 0;
    for (const t of toolCalls) {
        const argStr = JSON.stringify(t.args || {});
        const resStr = JSON.stringify(t.result || {});
        msgToolArgChars += argStr.length;
        msgToolResultChars += resStr.length;
    }
    totalToolArgChars += msgToolArgChars;
    totalToolResultChars += msgToolResultChars;

    console.log(`--- Message #${idx + 1} ---`);
    console.log(`Role: ${d.role}`);
    console.log(`Text: ${textLen} chars (~${Math.round(textLen / 4)} tokens est.)`);

    if (d.attachments?.length) {
        console.log(`Attachments: ${d.attachments.length} items`);
        for (const a of d.attachments) {
            console.log(`  - ${a.type || a.mimeType || 'unknown'}: ${a.name || a.url || '?'}`);
        }
    }

    if (d.appContext) {
        const ctxStr = JSON.stringify(d.appContext);
        console.log(`AppContext: ${ctxStr.length} chars (~${Math.round(ctxStr.length / 4)} tokens est.)`);
    }

    if (toolCalls.length) {
        console.log(`Tool calls: ${toolCalls.length}`);
        for (const t of toolCalls) {
            const argStr = JSON.stringify(t.args || {});
            const resStr = JSON.stringify(t.result || {});
            console.log(`  ${t.name}: args=${argStr.length}ch result=${resStr.length}ch`);
        }
        console.log(`  Total: args=${msgToolArgChars}ch (~${Math.round(msgToolArgChars / 4)} tok) results=${msgToolResultChars}ch (~${Math.round(msgToolResultChars / 4)} tok)`);
    }

    if (d.tokenUsage) {
        const tu = d.tokenUsage;
        console.log(`TOKEN USAGE (from API):`);
        console.log(`  promptTokens:     ${tu.promptTokens?.toLocaleString()}`);
        console.log(`  completionTokens: ${tu.completionTokens?.toLocaleString()}`);
        console.log(`  totalTokens:      ${tu.totalTokens?.toLocaleString()}`);
        console.log(`  cachedTokens:     ${tu.cachedTokens?.toLocaleString() ?? '—'}`);
        console.log(`  cacheWriteTokens: ${tu.cacheWriteTokens?.toLocaleString() ?? '—'}`);
        const contextUsed = (tu.promptTokens || 0) + (tu.cachedTokens || 0) + (tu.cacheWriteTokens || 0);
        console.log(`  → contextUsed (UI formula): ${contextUsed.toLocaleString()}`);
    }

    if (d.model) {
        console.log(`Model: ${d.model}`);
    }

    console.log('');
}

// 3. Summary
console.log('=== TOTALS ===');
console.log(`Total text chars: ${totalTextChars.toLocaleString()} (~${Math.round(totalTextChars / 4).toLocaleString()} tokens)`);
console.log(`Total tool arg chars: ${totalToolArgChars.toLocaleString()} (~${Math.round(totalToolArgChars / 4).toLocaleString()} tokens)`);
console.log(`Total tool result chars: ${totalToolResultChars.toLocaleString()} (~${Math.round(totalToolResultChars / 4).toLocaleString()} tokens)`);
const grandTotal = totalTextChars + totalToolArgChars + totalToolResultChars;
console.log(`Grand total chars: ${grandTotal.toLocaleString()} (~${Math.round(grandTotal / 4).toLocaleString()} tokens)`);

process.exit(0);
