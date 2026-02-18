/**
 * shared/db.ts — Firebase Admin initialization and Firestore instance.
 *
 * Single source of truth for the `db` reference used across all Cloud Functions.
 */
import * as admin from "firebase-admin";

// Initialize once — subsequent calls to initializeApp() are no-ops
if (!admin.apps.length) {
    admin.initializeApp();
}

export const db = admin.firestore();
export { admin };
