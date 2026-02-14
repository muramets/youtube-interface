// =============================================================================
// useFileAttachments — Eager Upload Hook
// Files start uploading immediately when attached.
// =============================================================================

import { useState, useCallback, useRef } from 'react';
import type { StagedFile, ReadyAttachment } from '../../../core/types/chatAttachment';
import { getAttachmentType, isAllowedMimeType, isFileWithinLimit, getFileSizeLabel, AiService } from '../../../core/services/aiService';
import { uploadStagingAttachment, deleteStagingAttachment } from '../../../core/services/storageService';
import { useUIStore } from '../../../core/stores/uiStore';

export function useFileAttachments(userId?: string, channelId?: string) {
    const [stagedFiles, setStagedFiles] = useState<StagedFile[]>([]);
    const stagedFilesRef = useRef(stagedFiles);
    stagedFilesRef.current = stagedFiles;

    const { showToast } = useUIStore();

    /**
     * Validate, stage, and start uploading files immediately.
     */
    const addFiles = useCallback((files: File[]) => {
        if (!userId || !channelId) return;

        const allowed: File[] = [];
        const rejected: string[] = [];

        for (const f of files) {
            if (!isAllowedMimeType(f)) continue;
            if (!isFileWithinLimit(f)) {
                rejected.push(`${f.name} (max ${getFileSizeLabel(f)})`);
                continue;
            }
            allowed.push(f);
        }

        if (rejected.length > 0) {
            showToast(`Files too large: ${rejected.join(', ')}`, 'error');
        }

        if (allowed.length === 0) return;

        // Create staged entries
        const newEntries: StagedFile[] = allowed.map((file) => ({
            id: crypto.randomUUID(),
            file,
            status: 'uploading' as const,
        }));

        setStagedFiles((prev) => [...prev, ...newEntries]);

        // Start uploads in parallel (fire-and-forget per file)
        for (const entry of newEntries) {
            uploadFile(entry.id, entry.file, userId, channelId);
        }
    }, [userId, channelId, showToast]);

    /**
     * Upload a single file: first to Firebase Storage, then to Gemini via CF.
     */
    const uploadFile = async (id: string, file: File, uid: string, chId: string) => {
        try {
            // Step 1: Upload to Firebase Storage
            const { storagePath, downloadUrl } = await uploadStagingAttachment(uid, chId, id, file);

            // Step 2: Upload to Gemini via Cloud Function (uses storagePath)
            const gemini = await AiService.uploadToGemini(storagePath, file.type, file.name);

            const result: ReadyAttachment = {
                type: getAttachmentType(file.type),
                url: downloadUrl,
                storagePath,
                name: file.name,
                mimeType: file.type,
                geminiFileUri: gemini.uri,
                geminiFileExpiry: gemini.expiryMs,
            };

            setStagedFiles((prev) =>
                prev.map((f) => (f.id === id ? { ...f, status: 'ready' as const, result } : f))
            );
        } catch (err) {
            setStagedFiles((prev) =>
                prev.map((f) =>
                    f.id === id
                        ? { ...f, status: 'error' as const, error: err instanceof Error ? err.message : 'Upload failed' }
                        : f
                )
            );
        }
    };

    /**
     * Remove a staged file. Cleans up from Firebase Storage if already uploaded.
     */
    const removeFile = useCallback((id: string) => {
        const file = stagedFilesRef.current.find((f) => f.id === id);
        setStagedFiles((prev) => prev.filter((f) => f.id !== id));

        // Fire-and-forget cleanup of uploaded storage file
        if (file?.result?.storagePath) {
            deleteStagingAttachment(file.result.storagePath).catch(() => { });
        }
    }, []);

    /**
     * Clear all staged files WITHOUT deleting from storage (files are now part of the message).
     * Called after successful send.
     */
    const clearAll = useCallback(() => {
        setStagedFiles([]);
    }, []);

    /**
     * Clear all staged files AND delete from storage (e.g., on conversation switch or cleanup).
     */
    const clearAndCleanup = useCallback(() => {
        const current = stagedFilesRef.current;
        setStagedFiles([]);
        for (const f of current) {
            if (f.result?.storagePath) {
                deleteStagingAttachment(f.result.storagePath).catch(() => { });
            }
        }
    }, []);

    const allReady = stagedFiles.length > 0 && stagedFiles.every((f) => f.status === 'ready');
    const hasFiles = stagedFiles.length > 0;
    const isAnyUploading = stagedFiles.some((f) => f.status === 'uploading');

    const getReadyAttachments = useCallback((): ReadyAttachment[] => {
        return stagedFiles
            .filter((f): f is StagedFile & { result: ReadyAttachment } => f.status === 'ready' && !!f.result)
            .map((f) => f.result);
    }, [stagedFiles]);

    return {
        stagedFiles,
        addFiles,
        removeFile,
        clearAll,
        clearAndCleanup,
        allReady,
        hasFiles,
        isAnyUploading,
        getReadyAttachments,
    };
}
