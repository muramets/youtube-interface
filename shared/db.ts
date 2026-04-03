/**
 * shared/db.ts — Firebase Admin initialization and Firestore instance.
 *
 * Single source of truth for the `db` reference used across all Cloud Functions.
 */
import * as admin from "firebase-admin";

// Initialize once — subsequent calls to initializeApp() are no-ops.
// In Cloud Functions runtime, initializeApp() auto-discovers config.
// In CLI mode, storageBucket must be derived from GOOGLE_CLOUD_PROJECT.
if (!admin.apps.length) {
    const projectId = process.env.GOOGLE_CLOUD_PROJECT;
    admin.initializeApp(projectId ? {
        storageBucket: `${projectId}.firebasestorage.app`,
    } : undefined);
}

export const db = admin.firestore();
export { admin };
