// =============================================================================
// debugSendLog — Structured console logging for Gemini send requests
//
// Extracted from chatStore.sendMessage() for SRP.
// Only runs in DEV mode. Logs layered view of what's sent to Gemini:
//   - Settings layer (language, style, prompts)
//   - Layer 1: Persistent Context (videos, traffic, canvas)
//   - Layer 2: Per-message context
//   - Layer 4: Cross-conversation memory
//   - System prompt size
// =============================================================================

import type { AiAssistantSettings, ChatProject, ChatMessage, ConversationMemory } from '../../types/chat';
import type { AppContextItem } from '../../types/appContext';
import { getVideoCards, getTrafficContexts, getCanvasContexts } from '../../types/appContext';
import { DEBUG_ENABLED } from '../../utils/debug';

interface DebugSendLogParams {
    model: string;
    aiSettings: AiAssistantSettings;
    projects: ChatProject[];
    activeProjectId: string | null;
    persistedContext: AppContextItem[] | undefined;
    appContext: AppContextItem[] | undefined;
    messages: ChatMessage[];
    memories: ConversationMemory[];
    thumbnailUrls: string[];
    systemPrompt: string;
}

/**
 * Log a structured view of everything being sent to Gemini.
 * No-op in production.
 */
export function debugSendLog(params: DebugSendLogParams): void {
    if (!import.meta.env.DEV || !DEBUG_ENABLED.chat) return;

    const { model, aiSettings, projects, activeProjectId, persistedContext, appContext, messages, memories, thumbnailUrls, systemPrompt } = params;

    console.group('🤖 Sending to Gemini | Model:', model);

    // Settings layer
    console.groupCollapsed('⚙️ Settings Layer');
    console.log('  Language:', aiSettings.responseLanguage || 'auto', '| Style:', aiSettings.responseStyle || 'default');
    console.log('  Global prompt:', aiSettings.globalSystemPrompt ? `✓ (${aiSettings.globalSystemPrompt.length} chars)` : '—');
    const activeProject = projects.find(p => p.id === activeProjectId);
    console.log('  Project prompt:', activeProject?.systemPrompt ? `✓ (${activeProject.systemPrompt.length} chars)` : '—');
    console.log('  Thinking discipline: ✓ | Anti-hallucination: ✓');
    console.groupEnd();

    // Layer 1: Persistent Context
    if (persistedContext && persistedContext.length > 0) {
        const vcCount = getVideoCards(persistedContext).length;
        const tcCount = getTrafficContexts(persistedContext).length;
        const ccList = getCanvasContexts(persistedContext);
        const nodeCount = ccList.reduce((sum, cc) => sum + cc.nodes.length, 0);
        console.groupCollapsed(`📎 Layer 1: Persistent Context (${vcCount} videos, ${tcCount} traffic, ${ccList.length} canvas / ${nodeCount} nodes)`);

        let videoIdx = 0;
        persistedContext.forEach(item => {
            if (item.type === 'video-card') {
                const v = item;
                videoIdx++;
                const ownerLabel = v.ownership === 'own-draft' ? 'Draft' : v.ownership === 'own-published' ? 'Video' : 'Competitor';
                console.log(`  #${videoIdx} 🎬 [${ownerLabel}] ${v.title}`);
                console.log(`      views: ${v.viewCount ?? '—'} | dur: ${v.duration ?? '—'} | pub: ${v.publishedAt ?? '—'} | ch: ${v.channelTitle ?? '—'}`);
                const deltaParts: string[] = [];
                if (v.delta24h != null) deltaParts.push(`24h: ${v.delta24h >= 0 ? '+' : ''}${v.delta24h}`);
                if (v.delta7d != null) deltaParts.push(`7d: ${v.delta7d >= 0 ? '+' : ''}${v.delta7d}`);
                if (v.delta30d != null) deltaParts.push(`30d: ${v.delta30d >= 0 ? '+' : ''}${v.delta30d}`);
                console.log(`      desc: ${v.description ? `✓ (${v.description.length}ch, not in prompt — available via tool)` : '—'} | tags: ${v.tags && v.tags.length > 0 ? `${v.tags.length} (not in prompt — available via tool)` : '—'}${deltaParts.length > 0 ? ` | Δ: ${deltaParts.join(' / ')}` : ''}`);

            } else if (item.type === 'suggested-traffic') {
                const sv = item.sourceVideo;
                console.log(`  📊 [Traffic] ${sv.title} → ${item.suggestedVideos.length} suggested`);
                console.log(`      snapshot: ${item.snapshotDate ?? '—'} | label: ${item.snapshotLabel ?? '—'}`);
                console.log(`      source: views ${sv.viewCount ?? '—'} | dur: ${sv.duration ?? '—'} | pub: ${sv.publishedAt ?? '—'}`);
                item.suggestedVideos.forEach((sg, i) => {
                    console.log(`      [${i + 1}] ${sg.title}`);
                    console.log(`          impr: ${sg.impressions.toLocaleString()} | CTR: ${(sg.ctr * 100).toFixed(1)}% | views: ${sg.views.toLocaleString()} | dur: ${sg.avgViewDuration} | watch: ${sg.watchTimeHours.toFixed(1)}h`);
                    console.log(`          ch: ${sg.channelTitle ?? '—'} | traffic: ${sg.trafficType ?? '—'} | viewer: ${sg.viewerType ?? '—'} | niche: ${sg.niche ?? '—'}`);
                    console.log(`          desc: ${sg.description ? `✓ (${sg.description.length}ch)` : '—'} | tags: ${sg.tags && sg.tags.length > 0 ? sg.tags.length : '—'}`);
                });

            } else if (item.type === 'canvas-selection') {
                console.log(`  🖼️ Canvas (${item.nodes.length} nodes)`);
                item.nodes.forEach((node, i) => {
                    if (node.nodeType === 'video') {
                        videoIdx++;
                        const nodeLabel = node.ownership === 'own-draft' ? 'Draft' : node.ownership === 'own-published' ? 'Video' : 'Competitor';
                        console.log(`      [${i + 1}] 🎬 #${videoIdx} [${nodeLabel}] ${node.title}`);
                        console.log(`          views: ${node.viewCount ?? '—'} | dur: ${node.duration ?? '—'} | ch: ${node.channelTitle ?? '—'}`);
                        console.log(`          desc: ${node.description ? `✓ (${node.description.length}ch)` : '—'} | tags: ${node.tags && node.tags.length > 0 ? `${node.tags.length} [${node.tags.slice(0, 3).join(', ')}${node.tags.length > 3 ? '…' : ''}]` : '—'}`);
                    } else if (node.nodeType === 'traffic-source') {
                        console.log(`      [${i + 1}] 📊 ${node.title} — impr: ${node.impressions?.toLocaleString() ?? '—'} | CTR: ${node.ctr != null ? (node.ctr * 100).toFixed(1) + '%' : '—'} | views: ${node.views?.toLocaleString() ?? '—'}`);
                        console.log(`          desc: ${node.description ? `✓ (${node.description.length}ch)` : '—'} | tags: ${node.tags && node.tags.length > 0 ? `${node.tags.length} [${node.tags.slice(0, 3).join(', ')}${node.tags.length > 3 ? '…' : ''}]` : '—'}`);
                    } else if (node.nodeType === 'sticky-note') {
                        console.log(`      [${i + 1}] 📝 ${(node.content || '').slice(0, 80)}${(node.content || '').length > 80 ? '…' : ''}`);
                    } else if (node.nodeType === 'image') {
                        console.log(`      [${i + 1}] 🖼 ${node.alt || '(no alt)'} | url: ${node.imageUrl ? '✓' : '—'}`);
                    }
                });
            }
        });
        console.log('  Thumbnails:', thumbnailUrls.length, 'URLs');
        console.groupEnd(); // Layer 1
    } else {
        console.log('📎 Layer 1: Persistent Context — empty');
    }

    // Layer 2: Per-message context binding
    const countByType = (ctx: AppContextItem[]) => {
        const vc = ctx.filter(c => c.type === 'video-card').length;
        const tcItems = ctx.filter(c => c.type === 'suggested-traffic');
        const tcVideos = tcItems.reduce((sum, c) => sum + (c.type === 'suggested-traffic' ? c.suggestedVideos.length : 0), 0);
        const ccItems = ctx.filter(c => c.type === 'canvas-selection');
        const ccNodes = ccItems.reduce((sum, c) => sum + (c.type === 'canvas-selection' ? c.nodes.length : 0), 0);
        return [
            vc && `${vc} video`,
            tcItems.length && `${tcItems.length} traffic / ${tcVideos} videos`,
            ccItems.length && `${ccItems.length} canvas / ${ccNodes} nodes`,
        ].filter(Boolean).join(', ');
    };
    const msgsWithContext = messages.filter(m => m.appContext && m.appContext.length > 0);
    console.groupCollapsed(`🔗 Layer 2: ${msgsWithContext.length}/${messages.length} messages have appContext`);
    msgsWithContext.forEach(m => {
        const idx = messages.indexOf(m) + 1;
        const snippet = m.text.slice(0, 40) + (m.text.length > 40 ? '…' : '');
        console.log(`  msg #${idx} (${m.role}): "${snippet}" → ${m.appContext!.length} items (${countByType(m.appContext!)})`);
    });
    if (appContext && appContext.length > 0) {
        console.log(`  📤 current msg: ${appContext.length} items (${countByType(appContext)})`);
    } else {
        console.log('  📤 current msg: 0 items');
    }
    console.groupEnd(); // Layer 2

    // Layer 4: Cross-conversation memory
    const memTokens = memories.reduce((sum, m) => sum + Math.ceil(m.content.length / 4), 0);
    console.log(`🧠 Layer 4: ${memories.length} memories (~${memTokens} tokens)`);

    // System prompt size summary
    if (systemPrompt) {
        const chars = systemPrompt.length;
        const tokens = Math.ceil(chars / 4);
        console.log(`📏 System prompt: ~${chars.toLocaleString()} chars (~${tokens.toLocaleString()} tokens)`);
    }

    console.groupEnd(); // 🤖 Sending to Gemini
}
