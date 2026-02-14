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
    runTransaction,
    writeBatch,
    type DocumentData,
    type QueryConstraint,
    type WithFieldValue,
    type UpdateData,
    type Transaction
} from 'firebase/firestore';
import { db } from '../../config/firebase';

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
 * Fetch a single document by full path
 */
export const getDocument = async <T>(path: string): Promise<T | null> => {
    const docRef = doc(db, path);
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

/**
 * Batch-update multiple documents atomically (single snapshot trigger).
 */
export const batchUpdateDocuments = async (
    updates: { path: string; id: string; data: UpdateData<DocumentData> }[]
) => {
    const batch = writeBatch(db);
    for (const { path: p, id, data } of updates) {
        batch.update(doc(db, p, id), data);
    }
    await batch.commit();
};

/**
 * Batch-delete multiple documents atomically.
 * Auto-chunks into batches of 500 (Firestore limit).
 */
export const batchDeleteDocuments = async (
    items: { path: string; id: string }[]
) => {
    const BATCH_LIMIT = 500;
    for (let i = 0; i < items.length; i += BATCH_LIMIT) {
        const chunk = items.slice(i, i + BATCH_LIMIT);
        const batch = writeBatch(db);
        for (const { path: p, id } of chunk) {
            batch.delete(doc(db, p, id));
        }
        await batch.commit();
    }
};

/**
 * Execute a transaction
 */
export const runFirestoreTransaction = async <T>(
    updateFunction: (transaction: Transaction) => Promise<T>
): Promise<T> => {
    return runTransaction(db, updateFunction);
};

/**
 * BUSINESS LOGIC: Optimistic Concurrency Update
 * 
 * Performs a read-check-increment-write cycle within a transaction.
 * 
 * @param path - Collection path
 * @param id - Document ID
 * @param revisionField - Name of the field tracking revision (e.g., 'packagingRevision')
 * @param expectedRevision - The revision the client had when editing started
 * @param updatesGenerator - Function that returns the data to update based on the current full document data
 */
export const runSafeUpdate = async <T extends DocumentData>(
    path: string,
    id: string,
    revisionField: keyof T,
    expectedRevision: number | undefined,
    updatesGenerator: (currentData: T) => Partial<T>
) => {
    return runFirestoreTransaction(async (transaction) => {
        const docRef = doc(db, path, id);
        const docSnapshot = await transaction.get(docRef);

        if (!docSnapshot.exists()) {
            throw new Error('DOCUMENT_NOT_FOUND');
        }

        const currentData = docSnapshot.data() as T;
        const currentRevision = (currentData[revisionField] as number) || 0;

        // Verify revision matches expected (ignore if expected is undefined for new docs)
        if (expectedRevision !== undefined && currentRevision !== expectedRevision) {
            console.error('[firestore] Revision mismatch:', { expectedRevision, currentRevision });
            throw new Error('VERSION_MISMATCH');
        }

        const updates = updatesGenerator(currentData);

        // Always increment revision on safe update
        const nextRevision = currentRevision + 1;

        transaction.update(docRef, {
            ...updates,
            [revisionField]: nextRevision
        } as UpdateData<T>);

        return { ...currentData, ...updates, [revisionField]: nextRevision };
    });
};
