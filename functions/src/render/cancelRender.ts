/**
 * render/cancelRender.ts — Cancel a running render job.
 */
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { admin, db } from "../shared/db.js";

/**
 * Callable Function: Cancel a running render job.
 *
 * Sets the render document status to 'cancelled' in Firestore.
 * The Cloud Run Job's onSnapshot listener will detect this and
 * abort the ffmpeg process immediately.
 */
export const cancelRender = onCall(
    { timeoutSeconds: 10, memory: "128MiB" },
    async (request) => {
        if (!request.auth) {
            throw new HttpsError("unauthenticated", "Authentication required.");
        }
        const userId = request.auth.uid;
        const { channelId, videoId, renderId } = request.data;

        if (!channelId || !videoId || !renderId) {
            throw new HttpsError("invalid-argument", "Missing channelId, videoId, or renderId.");
        }

        const renderDocPath = `users/${userId}/channels/${channelId}/videos/${videoId}/renders/${renderId}`;
        const renderRef = db.doc(renderDocPath);
        const doc = await renderRef.get();

        if (!doc.exists) {
            throw new HttpsError("not-found", "Render job not found.");
        }

        const currentStatus = doc.data()?.status;
        if (currentStatus === 'complete' || currentStatus === 'render_failed' || currentStatus === 'cancelled') {
            return { success: true, alreadyFinished: true };
        }

        await renderRef.update({
            status: 'cancelled',
            cancelledAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        console.log(`[cancelRender] Cancelled render ${renderId} for video ${videoId}`);
        return { success: true };
    }
);
