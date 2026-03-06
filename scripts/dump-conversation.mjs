// Usage: node scripts/dump-conversation.mjs
// Reads a full conversation from Firestore and calculates its size.

import { createRequire } from 'module';
const require = createRequire(new URL('../functions/package.json', import.meta.url).pathname);
const admin = require('firebase-admin');

admin.initializeApp({ projectId: 'mytube-46104' });
const db = admin.firestore();

const CONV_PATH = 'users/t5SpemnaLAUJ6RgD3y6qBLDuwlh1/channels/sjh8jqliTFosZ2RDWRuj/chatConversations/3e22d868-9164-42a2-a535-3118fa0ed096';

// ── 1. Read the conversation document itself ──
console.log('='.repeat(80));
console.log('CONVERSATION DOCUMENT');
console.log('='.repeat(80));

const convDoc = await db.doc(CONV_PATH).get();
if (!convDoc.exists) {
  console.error('Conversation document not found!');
  process.exit(1);
}

const convData = convDoc.data();
for (const [key, value] of Object.entries(convData)) {
  if (typeof value === 'object' && value !== null) {
    console.log(`${key}: ${JSON.stringify(value, null, 2)}`);
  } else {
    console.log(`${key}: ${value}`);
  }
}

// ── 2. Read all messages ──
console.log('\n' + '='.repeat(80));
console.log('MESSAGES');
console.log('='.repeat(80));

const msgSnap = await db.collection(CONV_PATH + '/messages').orderBy('createdAt').get();

let totalTextChars = 0;
let totalToolArgsChars = 0;
let totalToolResultChars = 0;
let messageCount = 0;

for (const doc of msgSnap.docs) {
  const d = doc.data();
  messageCount++;

  console.log('\n' + '-'.repeat(80));
  console.log(`MESSAGE #${messageCount} (id: ${doc.id})`);
  console.log('-'.repeat(80));

  // Print all fields
  for (const [key, value] of Object.entries(d)) {
    if (key === 'text') {
      // Print full text
      const text = value || '';
      console.log(`text (${text.length} chars):`);
      console.log(text);
      totalTextChars += text.length;
    } else if (key === 'toolCalls') {
      // Handle tool calls specially
      const tc = value || [];
      console.log(`toolCalls (${tc.length} calls):`);
      for (let i = 0; i < tc.length; i++) {
        const t = tc[i];
        console.log(`  [${i}] name: ${t.name}`);

        // Arguments
        const argsStr = JSON.stringify(t.args || t.arguments || {});
        console.log(`  [${i}] args (${argsStr.length} chars): ${argsStr}`);
        totalToolArgsChars += argsStr.length;

        // Result
        if (t.result != null) {
          const resultStr = JSON.stringify(t.result);
          console.log(`  [${i}] result (${resultStr.length} chars): ${resultStr}`);
          totalToolResultChars += resultStr.length;
        } else {
          console.log(`  [${i}] result: null`);
        }

        // Any other fields on the tool call
        for (const [tk, tv] of Object.entries(t)) {
          if (!['name', 'args', 'arguments', 'result'].includes(tk)) {
            console.log(`  [${i}] ${tk}: ${JSON.stringify(tv)}`);
          }
        }
      }
    } else if (key === 'createdAt' || key === 'updatedAt') {
      // Firestore Timestamp
      if (value && value.toDate) {
        console.log(`${key}: ${value.toDate().toISOString()}`);
      } else {
        console.log(`${key}: ${JSON.stringify(value)}`);
      }
    } else if (typeof value === 'object' && value !== null) {
      console.log(`${key}: ${JSON.stringify(value, null, 2)}`);
    } else {
      console.log(`${key}: ${value}`);
    }
  }
}

// ── 3. Totals ──
console.log('\n' + '='.repeat(80));
console.log('SIZE TOTALS');
console.log('='.repeat(80));

const totalAll = totalTextChars + totalToolArgsChars + totalToolResultChars;

console.log(`Total messages: ${messageCount}`);
console.log(`Total text chars: ${totalTextChars.toLocaleString()}`);
console.log(`Total tool args chars: ${totalToolArgsChars.toLocaleString()}`);
console.log(`Total tool result chars: ${totalToolResultChars.toLocaleString()}`);
console.log(`Total all chars: ${totalAll.toLocaleString()}`);
console.log(`Estimated tokens (chars/4): ${Math.round(totalAll / 4).toLocaleString()}`);

// Also show the conversation document fields size
const convDataStr = JSON.stringify(convData);
console.log(`\nConversation document size: ${convDataStr.length.toLocaleString()} chars`);
console.log(`Estimated conversation doc tokens: ${Math.round(convDataStr.length / 4).toLocaleString()}`);

console.log(`\nGrand total (conv doc + messages): ${(totalAll + convDataStr.length).toLocaleString()} chars`);
console.log(`Grand total estimated tokens: ${Math.round((totalAll + convDataStr.length) / 4).toLocaleString()}`);

process.exit(0);
