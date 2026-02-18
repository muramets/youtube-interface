/**
 * shared/auth.ts — Authentication and authorization helpers.
 *
 * Used by AI Chat (onRequest) and any future HTTP endpoints
 * that need manual token verification.
 */
import { HttpsError } from "firebase-functions/v2/https";
import { admin, db } from "./db.js";

/**
 * Verify Firebase Auth token from Authorization header.
 * Returns the authenticated user's UID.
 */
export async function verifyAuthToken(authHeader?: string): Promise<string> {
    if (!authHeader?.startsWith("Bearer ")) {
        throw new HttpsError("unauthenticated", "Missing or invalid Authorization header.");
    }
    const token = authHeader.slice(7);
    const decoded = await admin.auth().verifyIdToken(token);
    return decoded.uid;
}

/**
 * Verify the authenticated user has access to the given channel.
 * Currently checks ownership (channel nested under user).
 * Extensible for shared channels via members subcollection / ACL.
 */
export async function verifyChannelAccess(userId: string, channelId: string): Promise<void> {
    const channelDoc = await db.doc(`users/${userId}/channels/${channelId}`).get();
    if (!channelDoc.exists) {
        throw new HttpsError("permission-denied", "Access denied to the specified channel.");
    }
}
