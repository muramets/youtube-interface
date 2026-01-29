import { doc, getDoc, setDoc, serverTimestamp, FieldValue } from 'firebase/firestore';
import { db } from '../../config/firebase';
import type { User } from 'firebase/auth';

export interface UserDocument {
    email: string | null;
    displayName: string | null;
    photoURL: string | null;
    createdAt: FieldValue;
    lastLoginAt: FieldValue;
}

export const UserService = {
    /**
     * Ensures the user document exists in Firestore.
     * Creates it if it doesn't exist, updates lastLoginAt if it does.
     */
    ensureUserDocument: async (user: User): Promise<void> => {
        const userDocRef = doc(db, 'users', user.uid);
        const userDoc = await getDoc(userDocRef);

        if (!userDoc.exists()) {
            // Create new user document
            const userData: UserDocument = {
                email: user.email,
                displayName: user.displayName,
                photoURL: user.photoURL,
                createdAt: serverTimestamp(),
                lastLoginAt: serverTimestamp()
            };
            await setDoc(userDocRef, userData);
        } else {
            // Update last login time
            await setDoc(userDocRef, {
                lastLoginAt: serverTimestamp()
            }, { merge: true });
        }
    }
};
