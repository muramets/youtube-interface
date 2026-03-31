#!/usr/bin/env node
/**
 * CLI bridge for HackTube tool handlers.
 *
 * Usage:
 *   GOOGLE_CLOUD_PROJECT=mytube-46104 node lib/cli-tool.js <toolName> ['{ json args }']
 *
 * Requires: gcloud auth application-default login
 */

import { executeTool } from "./services/tools/executor.js";
import { db } from "./shared/db.js";
import type { ToolContext } from "./services/tools/types.js";

const USER_ID = "t5SpemnaLAUJ6RgD3y6qBLDuwlh1";
const CHANNEL_ID = "sjh8jqliTFosZ2RDWRuj";

async function main(): Promise<void> {
    const [toolName, argsJson] = process.argv.slice(2);

    if (!toolName) {
        process.stderr.write(
            "Usage: node cli-tool.js <toolName> ['{\"arg\":\"value\"}']\n",
        );
        process.exit(1);
    }

    const args: Record<string, unknown> = argsJson ? JSON.parse(argsJson) as Record<string, unknown> : {};

    // Read YouTube API key + channel name from Firestore (one-time, cached by handler)
    const [settingsSnap, channelSnap] = await Promise.all([
        db.doc(`users/${USER_ID}/channels/${CHANNEL_ID}/settings/general`).get(),
        db.doc(`users/${USER_ID}/channels/${CHANNEL_ID}`).get(),
    ]);

    const youtubeApiKey = settingsSnap.exists
        ? (settingsSnap.data()?.apiKey as string | undefined)
        : undefined;
    const channelName = channelSnap.exists
        ? (channelSnap.data()?.name as string | undefined)
        : undefined;

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
