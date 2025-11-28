import {
    collection,
    doc,
    getDoc,
    getDocs,
    setDoc,
    updateDoc,
    deleteDoc,
    query,
    onSnapshot,
    type DocumentData,
    type QueryConstraint,
    type WithFieldValue,
    type UpdateData
} from 'firebase/firestore';
import { db } from '../firebase';

// Generic type for Firestore documents
export type FirestoreDoc<T> = T & { id: string };

/**
 * Helper to create a typed collection reference
 */
export const getCollectionRef = (path: string) => collection(db, path);

/**
 * Helper to create a typed doc reference
 */
export const getDocRef = (path: string, id?: string) => id ? doc(db, path, id) : doc(collection(db, path));

/**
 * Fetch a single document
 */
export const fetchDoc = async <T>(path: string, id: string): Promise<T | null> => {
    const docRef = doc(db, path, id);
    const snapshot = await getDoc(docRef);
    return snapshot.exists() ? (snapshot.data() as T) : null;
};

/**
 * Fetch all documents from a collection
 */
export const fetchCollection = async <T>(
    path: string,
    constraints: QueryConstraint[] = []
): Promise<FirestoreDoc<T>[]> => {
    const colRef = collection(db, path);
    const q = query(colRef, ...constraints);
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ ...(doc.data() as T), id: doc.id }));
};

/**
 * Subscribe to a collection
 */
export const subscribeToCollection = <T>(
    path: string,
    callback: (data: FirestoreDoc<T>[]) => void,
    constraints: QueryConstraint[] = []
) => {
    const colRef = collection(db, path);
    const q = query(colRef, ...constraints);
    return onSnapshot(q, (snapshot) => {
        const data = snapshot.docs.map(doc => ({ ...(doc.data() as T), id: doc.id }));
        callback(data);
    });
};

/**
 * Subscribe to a single document
 */
export const subscribeToDoc = <T>(
    path: string,
    id: string,
    callback: (data: T | null) => void
) => {
    const docRef = doc(db, path, id);
    return onSnapshot(docRef, (snapshot) => {
        callback(snapshot.exists() ? (snapshot.data() as T) : null);
    });
};

/**
 * Create or Overwrite a document
 */
export const setDocument = async <T extends WithFieldValue<DocumentData>>(
    path: string,
    id: string,
    data: T,
    merge: boolean = false
) => {
    const docRef = doc(db, path, id);
    await setDoc(docRef, data, { merge });
};

/**
 * Update a document
 */
export const updateDocument = async <T extends DocumentData>(
    path: string,
    id: string,
    data: UpdateData<T>
) => {
    const docRef = doc(db, path, id);
    await updateDoc(docRef, data);
};

/**
 * Delete a document
 */
export const deleteDocument = async (path: string, id: string) => {
    const docRef = doc(db, path, id);
    await deleteDoc(docRef);
};
