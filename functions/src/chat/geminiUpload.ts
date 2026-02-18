/**
 * chat/geminiUpload.ts — Upload a file from Firebase Storage to Gemini File API.
 */
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";

const geminiApiKey = defineSecret("GEMINI_API_KEY");

export const geminiUpload = onCall(
    {
        secrets: [geminiApiKey],
        maxInstances: 5,
        timeoutSeconds: 120,
        memory: "512MiB",
    },
    async (request) => {
        if (!request.auth) {
            throw new HttpsError("unauthenticated", "Authentication required.");
        }
        const userId = request.auth.uid;

        const { storagePath, mimeType, displayName } = request.data as {
            storagePath: string;
            mimeType: string;
            displayName?: string;
        };
        if (!storagePath || !mimeType) {
            throw new HttpsError("invalid-argument", "storagePath and mimeType are required.");
        }

        // Validate storage path belongs to the authenticated user
        if (!storagePath.startsWith(`users/${userId}/`)) {
            throw new HttpsError("permission-denied", "Access denied to the specified storage path.");
        }

        const apiKey = geminiApiKey.value();
        if (!apiKey) {
            throw new HttpsError("internal", "Gemini API key is not configured on the server.");
        }

        try {
            const { uploadFromStoragePath } = await import("../services/gemini.js");
            const result = await uploadFromStoragePath(apiKey, storagePath, mimeType, displayName || "attachment");
            return { uri: result.uri, expiryMs: result.expiryMs };
        } catch (err) {
            if (err instanceof HttpsError) throw err;
            const msg = err instanceof Error ? err.message : "Unknown error";
            console.error("geminiUpload failed", { userId, storagePath, mimeType, error: msg });

            // Cleanup: delete orphaned file from Storage (fire-and-forget)
            try {
                const admin = await import("firebase-admin");
                await admin.default.storage().bucket().file(storagePath).delete();
            } catch { /* ignore cleanup errors */ }

            throw new HttpsError("internal", `File upload to Gemini failed: ${msg}`);
        }
    }
);
