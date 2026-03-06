// =============================================================================
// Token Transparency — Conversation Audit Tool
// =============================================================================
//
// Usage:
//   node scripts/audit-tokens.mjs <conversationPath>
//   node scripts/audit-tokens.mjs <conversationPath> --date-from 2026-01-01 --date-to 2026-03-01
//   node scripts/audit-tokens.mjs <conversationPath> --model claude-sonnet-4-20250514
//   node scripts/audit-tokens.mjs <conversationPath> --compare-provider
//
// Reads conversation + all messages, shows exact token data per message.
// Supports normalizedUsage (new) with fallback to legacy tokenUsage.
//
// Options:
//   --date-from <YYYY-MM-DD>   Filter messages after this date
//   --date-to <YYYY-MM-DD>     Filter messages before this date
//   --model <model-id>         Filter messages by model
//   --compare-provider         Enable Phase 2: Anthropic Admin API comparison (requires ANTHROPIC_ADMIN_KEY)
//   --help                     Show usage
// =============================================================================

import { createRequire } from 'module';
const require = createRequire(new URL('../functions/package.json', import.meta.url).pathname);
const admin = require('firebase-admin');

admin.initializeApp({ projectId: 'mytube-46104' });
const db = admin.firestore();

// --- CLI argument parsing ---
const args = process.argv.slice(2);
if (args.includes('--help') || args.length === 0) {
    console.log(`
Token Transparency — Conversation Audit Tool

Usage:
  node scripts/audit-tokens.mjs <conversationPath> [options]

Example:
  node scripts/audit-tokens.mjs users/UID/channels/CID/chatConversations/CONV_ID

Options:
  --date-from <YYYY-MM-DD>   Filter messages after this date
  --date-to <YYYY-MM-DD>     Filter messages before this date
  --model <model-id>         Filter messages by model
  --compare-provider         Compare with Anthropic Admin API (requires ANTHROPIC_ADMIN_KEY env var)
  --help                     Show this help
`);
    process.exit(0);
}

const convPath = args[0];
if (!convPath || convPath.startsWith('--')) {
    console.error('Error: first argument must be a Firestore conversation path');
    console.error('Example: users/UID/channels/CID/chatConversations/CONV_ID');
    process.exit(1);
}

function getArg(name) {
    const idx = args.indexOf(name);
    return idx !== -1 && idx + 1 < args.length ? args[idx + 1] : null;
}
const dateFrom = getArg('--date-from');
const dateTo = getArg('--date-to');
const filterModel = getArg('--model');
const compareProvider = args.includes('--compare-provider');

// --- 1. Read conversation document ---
const convDoc = await db.doc(convPath).get();
if (!convDoc.exists) {
    console.error(`Error: conversation not found at ${convPath}`);
    process.exit(1);
}
const conv = convDoc.data();

console.log('=== CONVERSATION AUDIT ===');
console.log(`Title: ${conv.title ?? '(untitled)'}`);
console.log(`Model: ${conv.model ?? '(not set)'}`);
console.log(`Created: ${conv.createdAt?.toDate?.()?.toISOString() ?? conv.createdAt ?? '?'}`);
console.log('');

// --- 2. Read all messages ---
const snap = await db.collection(`${convPath}/messages`).orderBy('createdAt').get();

let filteredDocs = snap.docs;
if (dateFrom) {
    const from = new Date(dateFrom);
    filteredDocs = filteredDocs.filter(d => {
        const ts = d.data().createdAt?.toDate?.() ?? new Date(d.data().createdAt);
        return ts >= from;
    });
}
if (dateTo) {
    const to = new Date(dateTo);
    filteredDocs = filteredDocs.filter(d => {
        const ts = d.data().createdAt?.toDate?.() ?? new Date(d.data().createdAt);
        return ts <= to;
    });
}
if (filterModel) {
    filteredDocs = filteredDocs.filter(d => d.data().model === filterModel);
}

const userCount = filteredDocs.filter(d => d.data().role === 'user').length;
const modelCount = filteredDocs.filter(d => d.data().role === 'model').length;
console.log(`Messages: ${filteredDocs.length} (${userCount} user, ${modelCount} model)`);
console.log('');

// --- 3. Per-message breakdown ---
let conversationTotalCost = 0;
let msgIdx = 0;

for (const doc of filteredDocs) {
    const d = doc.data();
    msgIdx++;

    if (d.role !== 'model') continue;

    const nu = d.normalizedUsage;
    const tu = d.tokenUsage;
    const status = d.status ?? 'complete';
    const toolCalls = d.toolCalls || [];
    const model = d.model ?? conv.model ?? '?';

    console.log(`--- Msg#${msgIdx} | ${model} | ${status}${nu?.partial ? ' (partial)' : ''} ---`);

    if (nu) {
        // New normalizedUsage path
        const cw = nu.contextWindow;
        const bi = nu.billing;
        const cost = bi?.cost?.total ?? 0;
        conversationTotalCost += cost;

        const iterations = nu.iterationDetails?.length ?? 1;
        const toolCount = toolCalls.length;

        if (toolCount > 0 || iterations > 1) {
            console.log(`  ${toolCount} tools, ${iterations} iteration${iterations > 1 ? 's' : ''}`);
        }

        console.log(`  Cost: $${cost.toFixed(4)}`);

        if (bi?.cost?.withoutCache != null && bi.cost.withoutCache > cost + 0.0001) {
            const saved = bi.cost.withoutCache - cost;
            const savedPct = Math.round((saved / bi.cost.withoutCache) * 100);
            console.log(`  Without cache: $${bi.cost.withoutCache.toFixed(4)} (saved ${savedPct}%)`);
        }

        // Per-iteration detail
        if (nu.iterationDetails && nu.iterationDetails.length > 1) {
            for (let i = 0; i < nu.iterationDetails.length; i++) {
                const it = nu.iterationDetails[i];
                const inK = (it.input?.total / 1000).toFixed(1);
                const outK = (it.output?.total / 1000).toFixed(1);
                console.log(`  Iter ${i + 1}: ${inK}K in, ${outK}K out`);
            }
        } else {
            // Single iteration summary
            const inK = (bi?.input?.total / 1000).toFixed(1);
            const outK = (bi?.output?.total / 1000).toFixed(1);
            console.log(`  Input: ${inK}K | Output: ${outK}K`);
        }

        // Thinking tokens
        if (bi?.output?.thinking > 0) {
            console.log(`  Thinking: ${bi.output.thinking.toLocaleString()} tokens`);
        }

        // Cache stats
        if (bi?.input?.cached > 0) {
            console.log(`  Cached: ${bi.input.cached.toLocaleString()} tokens`);
        }

        // Context window
        if (cw) {
            const pct = cw.percent?.toFixed(1) ?? '?';
            console.log(`  Context window: ${(cw.inputTokens / 1000).toFixed(1)}K / ${(cw.limit / 1000).toFixed(0)}K (${pct}%)`);
        }
    } else if (tu) {
        // Legacy tokenUsage fallback
        conversationTotalCost += 0; // Can't compute cost without pricing data in script
        console.log(`  [Legacy] prompt: ${tu.promptTokens?.toLocaleString()} | completion: ${tu.completionTokens?.toLocaleString()} | total: ${tu.totalTokens?.toLocaleString()}`);
        if (tu.cachedTokens) console.log(`  cached: ${tu.cachedTokens.toLocaleString()}`);
        const contextUsed = (tu.promptTokens || 0) + (tu.cachedTokens || 0) + (tu.cacheWriteTokens || 0);
        console.log(`  Context (legacy formula): ${contextUsed.toLocaleString()}`);
    } else {
        console.log(`  No token usage data`);
    }

    // Context breakdown
    if (d.contextBreakdown) {
        const cb = d.contextBreakdown;
        const parts = [];
        if (cb.systemPrompt > 0) parts.push(`sys:${cb.systemPrompt}ch`);
        if (cb.toolDefinitions > 0) parts.push(`tools:${cb.toolDefinitions}ch`);
        if (cb.history > 0) parts.push(`hist:${cb.history}ch(${cb.historyMessageCount}msg)`);
        if (cb.memory > 0) parts.push(`mem:${cb.memory}ch`);
        if (cb.currentMessage > 0) parts.push(`msg:${cb.currentMessage}ch`);
        if (cb.toolResults > 0) parts.push(`results:${cb.toolResults}ch`);
        if (cb.imageTokens > 0) parts.push(`img:${cb.imageTokens}tok(${cb.imageCount})`);
        if (cb.usedSummary) parts.push('summary:yes');
        console.log(`  Breakdown: ${parts.join(' | ')}`);
    }

    console.log('');
}

// --- 4. Auxiliary costs ---
const auxiliaryCosts = conv.auxiliaryCosts || [];
let auxTotal = 0;
if (auxiliaryCosts.length > 0) {
    console.log('=== AUXILIARY COSTS ===');
    for (const ac of auxiliaryCosts) {
        console.log(`  ${ac.type}: $${ac.costUsd.toFixed(4)} (${ac.model})`);
        auxTotal += ac.costUsd;
    }
    console.log(`  Total auxiliary: $${auxTotal.toFixed(4)}`);
    console.log('');
}

// --- 5. Summary ---
console.log('=== TOTALS ===');
console.log(`Conversation cost (messages): $${conversationTotalCost.toFixed(4)}`);
if (auxTotal > 0) {
    console.log(`Auxiliary costs: $${auxTotal.toFixed(4)}`);
    console.log(`Grand total: $${(conversationTotalCost + auxTotal).toFixed(4)}`);
}

// --- 6. Phase 2: Provider comparison (Anthropic Admin API) ---
if (compareProvider) {
    console.log('\n=== PROVIDER COMPARISON ===');
    const apiKey = process.env.ANTHROPIC_ADMIN_KEY;
    if (!apiKey) {
        console.log('  Skipped: ANTHROPIC_ADMIN_KEY env var not set');
        console.log('  Set it with: export ANTHROPIC_ADMIN_KEY=your-key');
    } else {
        try {
            // Build date range from conversation messages
            const firstMsg = filteredDocs[0]?.data();
            const lastMsg = filteredDocs[filteredDocs.length - 1]?.data();
            const startDate = firstMsg?.createdAt?.toDate?.()?.toISOString()?.split('T')[0];
            const endDate = lastMsg?.createdAt?.toDate?.()?.toISOString()?.split('T')[0];

            if (!startDate || !endDate) {
                console.log('  Skipped: could not determine date range from messages');
            } else {
                const url = `https://api.anthropic.com/v1/organizations/usage?start_date=${startDate}&end_date=${endDate}`;
                const response = await fetch(url, {
                    headers: {
                        'x-api-key': apiKey,
                        'anthropic-version': '2023-06-01',
                    },
                });

                if (!response.ok) {
                    console.log(`  API error: ${response.status} ${response.statusText}`);
                    const body = await response.text();
                    console.log(`  ${body}`);
                } else {
                    const data = await response.json();
                    const providerCost = data.total_cost ?? data.usage?.reduce((s, u) => s + (u.cost ?? 0), 0) ?? 0;
                    console.log(`  Provider billing: $${providerCost.toFixed(4)}`);
                    console.log(`  Our internal:     $${(conversationTotalCost + auxTotal).toFixed(4)}`);
                    const diff = Math.abs(providerCost - (conversationTotalCost + auxTotal));
                    const diffPct = providerCost > 0 ? (diff / providerCost) * 100 : 0;
                    console.log(`  Discrepancy: $${diff.toFixed(4)} (${diffPct.toFixed(1)}%)`);
                    if (diffPct <= 2) {
                        console.log(`  ✓ Within 2% tolerance`);
                    } else {
                        console.log(`  ⚠ Exceeds 2% tolerance — investigate`);
                    }
                }
            }
        } catch (err) {
            console.log(`  Error: ${err.message}`);
        }
    }
}

process.exit(0);
