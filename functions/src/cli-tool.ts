#!/usr/bin/env node
/**
 * CLI bridge for HackTube tool handlers.
 *
 * Usage:
 *   GOOGLE_CLOUD_PROJECT=mytube-46104 node lib/cli-tool.js <toolName> ['{ json args }']
 *
 * Requires: gcloud auth application-default login
 */

import { execSync } from "child_process";
import { executeTool } from "./services/tools/executor.js";
import { db } from "./shared/db.js";
import type { ToolContext } from "./services/tools/types.js";

const PROJECT_ID = "mytube-46104";

const USER_ID = "t5SpemnaLAUJ6RgD3y6qBLDuwlh1";
const DEFAULT_CHANNEL_ID = "sjh8jqliTFosZ2RDWRuj";

async function listChannels(): Promise<void> {
    const snapshot = await db.collection(`users/${USER_ID}/channels`).get();
    const channels: Array<{ id: string; name: string; youtubeChannelId?: string }> = [];
    for (const doc of snapshot.docs) {
        const data = doc.data();
        channels.push({
            id: doc.id,
            name: (data.name as string) || "(unnamed)",
            youtubeChannelId: data.youtubeChannelId as string | undefined,
        });
    }
    process.stdout.write(JSON.stringify(channels, null, 2) + "\n");
    process.exit(0);
}

async function main(): Promise<void> {
    const [toolName, argsJson] = process.argv.slice(2);

    if (!toolName) {
        process.stderr.write(
            "Usage: node cli-tool.js <toolName> ['{\"arg\":\"value\"}']\n" +
            "       CHANNEL_ID=<id> node cli-tool.js <toolName> ['{...}']\n" +
            "       node cli-tool.js listChannels\n",
        );
        process.exit(1);
    }

    if (toolName === "listChannels") {
        await listChannels();
        return;
    }

    const CHANNEL_ID = process.env.CHANNEL_ID || DEFAULT_CHANNEL_ID;
    const args: Record<string, unknown> = argsJson ? JSON.parse(argsJson) as Record<string, unknown> : {};

    // Read YouTube API key + channel name from Firestore (one-time, cached by handler)
    const [settingsSnap, channelSnap] = await Promise.all([
        db.doc(`users/${USER_ID}/channels/${CHANNEL_ID}/settings/general`).get(),
        db.doc(`users/${USER_ID}/channels/${CHANNEL_ID}`).get(),
    ]);

    if (!channelSnap.exists) {
        process.stderr.write(`Channel ${CHANNEL_ID} not found. Run 'listChannels' to see available channels.\n`);
        process.exit(1);
    }

    const youtubeApiKey = settingsSnap.exists
        ? (settingsSnap.data()?.apiKey as string | undefined)
        : undefined;
    const channelName = channelSnap.exists
        ? (channelSnap.data()?.name as string | undefined)
        : undefined;

    // Resolve GEMINI_API_KEY from Secret Manager if not set (needed by searchDatabase, findSimilarVideos)
    if (!process.env.GEMINI_API_KEY) {
        try {
            process.env.GEMINI_API_KEY = execSync(
                `gcloud secrets versions access latest --secret=GEMINI_API_KEY --project=${PROJECT_ID}`,
                { encoding: "utf-8" },
            ).trim();
        } catch {
            process.stderr.write("[cli] Warning: Could not resolve GEMINI_API_KEY from Secret Manager\n");
        }
    }

    process.stderr.write(`[cli] Channel: ${channelName || CHANNEL_ID}\n`);

    const ctx: ToolContext = {
        userId: USER_ID,
        channelId: CHANNEL_ID,
        channelName,
        youtubeApiKey,
        model: "cli-tool",
    };

    const result = await executeTool({ name: toolName, args }, ctx);

    // Output JSON to stdout (parseable by caller)
    process.stdout.write(JSON.stringify(result.response, null, 2) + "\n");
    process.exit(0);
}

main().catch((err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    process.stderr.write(`CLI tool error: ${message}\n`);
    process.exit(1);
});
