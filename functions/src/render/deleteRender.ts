/**
 * render/deleteRender.ts — Delete a render job, its Firestore doc, and R2 file.
 */
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import { db } from "../shared/db.js";
import { S3Client, DeleteObjectCommand } from "@aws-sdk/client-s3";

const r2AccessKeyId = defineSecret("R2_ACCESS_KEY_ID");
const r2SecretAccessKey = defineSecret("R2_SECRET_ACCESS_KEY");
const r2Endpoint = defineSecret("R2_ENDPOINT");
const r2BucketName = defineSecret("R2_BUCKET_NAME");

/**
 * Callable Function: Permanently delete a render job.
 *
 * Deletes the R2 file and the Firestore render document.
 * Only the render owner (authenticated user) can delete.
 */
export const deleteRender = onCall(
    {
        timeoutSeconds: 15,
        memory: "256MiB",
        secrets: [r2AccessKeyId, r2SecretAccessKey, r2Endpoint, r2BucketName],
    },
    async (request) => {
        if (!request.auth) {
            throw new HttpsError("unauthenticated", "Authentication required.");
        }
        const userId = request.auth.uid;
        const { channelId, videoId, renderId } = request.data;

        if (!channelId || !videoId || !renderId) {
            throw new HttpsError("invalid-argument", "Missing channelId, videoId, or renderId.");
        }

        const rendersCollectionPath = `users/${userId}/channels/${channelId}/videos/${videoId}/renders`;

        // Get ALL render docs for this video — delete them all to prevent
        // orphaned docs from resurfacing during hydration
        const rendersSnap = await db.collection(rendersCollectionPath).get();

        if (rendersSnap.empty) {
            return { success: true, alreadyDeleted: true };
        }

        // Build R2 client once
        const r2 = new S3Client({
            region: "auto",
            endpoint: r2Endpoint.value(),
            credentials: {
                accessKeyId: r2AccessKeyId.value(),
                secretAccessKey: r2SecretAccessKey.value(),
            },
        });

        // Delete each render doc and its R2 file
        const batch = db.batch();
        for (const doc of rendersSnap.docs) {
            // Delete R2 file (best-effort — may already be expired by lifecycle policy)
            const r2Key = `renders/${doc.id}.mp4`;
            try {
                await r2.send(new DeleteObjectCommand({
                    Bucket: r2BucketName.value(),
                    Key: r2Key,
                }));
                console.log(`[deleteRender] Deleted R2 object: ${r2Key}`);
            } catch (err) {
                console.warn(`[deleteRender] R2 delete failed (non-fatal): ${err}`);
            }

            batch.delete(doc.ref);
        }

        await batch.commit();
        console.log(`[deleteRender] Deleted ${rendersSnap.size} render(s) for video ${videoId}`);

        return { success: true, deletedCount: rendersSnap.size };
    }
);
