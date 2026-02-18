/**
 * render/startRender.ts — Start a video render job via Cloud Tasks → Cloud Run Job.
 */
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { CloudTasksClient } from "@google-cloud/tasks";
import { randomUUID } from "node:crypto";
import { admin, db } from "../shared/db.js";


/**
 * Callable Function: Start a video render job.
 *
 * Flow: validate → create Firestore doc → enqueue Cloud Tasks → Cloud Run Job
 *
 * Accepts: {
 *   channelId: string,
 *   videoId: string,
 *   imageUrl: string,
 *   tracks: Array<{ audioStoragePath, volume, trimStart, trimEnd, duration, title }>,
 *   resolution: '720p' | '1080p' | '1440p' | '4k',
 *   loopCount: number,
 *   masterVolume: number,
 *   videoTitle: string,
 * }
 */
export const startRender = onCall(
    {
        timeoutSeconds: 60,
        memory: "256MiB",
    },
    async (request) => {
        // 1. Auth check
        if (!request.auth) {
            throw new HttpsError("unauthenticated", "Authentication required.");
        }
        const userId = request.auth.uid;

        const {
            channelId, videoId, imageUrl, tracks,
            resolution, loopCount, masterVolume, videoTitle,
        } = request.data;

        // 2. Input validation
        if (!channelId || !videoId || !imageUrl || !tracks?.length) {
            throw new HttpsError("invalid-argument", "Missing required fields.");
        }
        const validResolutions = ["720p", "1080p", "1440p", "4k"];
        if (!validResolutions.includes(resolution)) {
            throw new HttpsError("invalid-argument", `Invalid resolution: ${resolution}`);
        }

        // 2b. Validate each track has required fields for ffmpeg
        for (let i = 0; i < tracks.length; i++) {
            const t = tracks[i];
            if (!t.audioStoragePath || typeof t.audioStoragePath !== "string") {
                throw new HttpsError("invalid-argument", `Track ${i}: missing audioStoragePath.`);
            }
            if (typeof t.volume !== "number" || t.volume < 0) {
                throw new HttpsError("invalid-argument", `Track ${i}: invalid volume.`);
            }
            if (typeof t.duration !== "number" || t.duration <= 0) {
                throw new HttpsError("invalid-argument", `Track ${i}: invalid duration.`);
            }
        }

        // 3. Verify channel access
        const channelDoc = await db.doc(`users/${userId}/channels/${channelId}`).get();
        if (!channelDoc.exists) {
            throw new HttpsError("permission-denied", "Access denied.");
        }

        // 4. Create render document in Firestore
        const renderId = randomUUID();
        const renderDocPath = `users/${userId}/channels/${channelId}/videos/${videoId}/renders/${renderId}`;

        const renderParams = {
            imageUrl,
            tracks,
            resolution,
            loopCount,
            masterVolume,
            videoTitle,
        };

        await db.doc(renderDocPath).set({
            renderId,
            videoId,
            userId,
            channelId,
            status: "queued",
            progress: 0,
            params: renderParams,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        // 5. Enqueue Cloud Tasks job
        const projectId = process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT;
        if (!projectId) {
            throw new HttpsError("internal", "Missing GCLOUD_PROJECT / GOOGLE_CLOUD_PROJECT env var.");
        }
        const location = "us-central1";
        const queueName = "render-queue";

        const tasksClient = new CloudTasksClient();
        const queuePath = tasksClient.queuePath(projectId, location, queueName);

        // Cloud Run Job URL (HTTP endpoint that Cloud Tasks will call)
        const cloudRunUrl = `https://${location}-run.googleapis.com/apis/run.googleapis.com/v1/namespaces/${projectId}/jobs/render-worker:run`;

        await tasksClient.createTask({
            parent: queuePath,
            task: {
                httpRequest: {
                    httpMethod: "POST",
                    url: cloudRunUrl,
                    headers: { "Content-Type": "application/json" },
                    body: Buffer.from(JSON.stringify({
                        overrides: {
                            containerOverrides: [{
                                env: [
                                    { name: "RENDER_ID", value: renderId },
                                    { name: "USER_ID", value: userId },
                                    { name: "CHANNEL_ID", value: channelId },
                                    { name: "VIDEO_ID", value: videoId },
                                    { name: "RENDER_PARAMS_JSON", value: JSON.stringify(renderParams) },
                                    // R2 secrets are NOT passed here — they are configured
                                    // at the Cloud Run Job deployment level via Secret Manager.
                                    // This avoids exposing secrets in Cloud Tasks audit logs.
                                ],
                            }],
                        },
                    })).toString("base64"),
                    oauthToken: {
                        serviceAccountEmail: `${projectId}@appspot.gserviceaccount.com`,
                        scope: "https://www.googleapis.com/auth/cloud-platform",
                    },
                },
                // dispatchDeadline = HTTP response timeout for starting the Job (not render time)
                dispatchDeadline: { seconds: 60 },
            },
        });

        console.log(`[startRender] Enqueued render ${renderId} for video ${videoId}`);

        return {
            success: true,
            renderId,
            renderDocPath,
        };
    }
);
