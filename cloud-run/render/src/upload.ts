/**
 * upload.ts — R2 upload with automatic single/multipart strategy.
 *
 * - Small files (<100 MB): single PutObject
 * - Large files (≥100 MB): S3-compatible multipart upload
 */
import {
    S3Client, PutObjectCommand,
    CreateMultipartUploadCommand, UploadPartCommand,
    CompleteMultipartUploadCommand, AbortMultipartUploadCommand,
    type CompletedPart,
} from '@aws-sdk/client-s3';
import { createReadStream } from 'node:fs';
import { open } from 'node:fs/promises';

const MULTIPART_THRESHOLD = 100 * 1024 * 1024; // 100 MB
const PART_SIZE = 100 * 1024 * 1024;            // 100 MB per part

export interface UploadToR2Params {
    r2: S3Client;
    bucket: string;
    key: string;
    filePath: string;
    fileSize: number;
    contentType: string;
    contentDisposition: string;
    log: (step: string, meta?: Record<string, unknown>) => void;
}

export async function uploadToR2(params: UploadToR2Params): Promise<void> {
    const { r2, bucket, key, filePath, fileSize, contentType, contentDisposition, log } = params;

    // Small files: single PutObject (limit 5 GB, but we use threshold 100 MB)
    if (fileSize < MULTIPART_THRESHOLD) {
        const fileStream = createReadStream(filePath);
        await r2.send(new PutObjectCommand({
            Bucket: bucket,
            Key: key,
            Body: fileStream,
            ContentLength: fileSize,
            ContentType: contentType,
            ContentDisposition: contentDisposition,
        }));
        return;
    }

    // Large files: S3 multipart upload
    log('multipart_start', { fileSize, partSize: PART_SIZE, totalParts: Math.ceil(fileSize / PART_SIZE) });

    const { UploadId } = await r2.send(new CreateMultipartUploadCommand({
        Bucket: bucket,
        Key: key,
        ContentType: contentType,
        ContentDisposition: contentDisposition,
    }));

    if (!UploadId) {
        throw new Error('Failed to initiate multipart upload: no UploadId returned');
    }

    const completedParts: CompletedPart[] = [];

    try {
        const fileHandle = await open(filePath, 'r');
        try {
            const totalParts = Math.ceil(fileSize / PART_SIZE);

            for (let partNumber = 1; partNumber <= totalParts; partNumber++) {
                const start = (partNumber - 1) * PART_SIZE;
                const end = Math.min(start + PART_SIZE, fileSize);
                const partLength = end - start;

                // Read chunk into buffer (constant ~100 MB RAM, not entire file)
                const buffer = Buffer.alloc(partLength);
                await fileHandle.read(buffer, 0, partLength, start);

                const { ETag } = await r2.send(new UploadPartCommand({
                    Bucket: bucket,
                    Key: key,
                    UploadId,
                    PartNumber: partNumber,
                    Body: buffer,
                    ContentLength: partLength,
                }));

                completedParts.push({ PartNumber: partNumber, ETag });

                log('multipart_part_uploaded', {
                    part: partNumber,
                    totalParts,
                    partSize: partLength,
                    pct: Math.round((partNumber / totalParts) * 100),
                });
            }
        } finally {
            await fileHandle.close();
        }

        // Complete the multipart upload
        await r2.send(new CompleteMultipartUploadCommand({
            Bucket: bucket,
            Key: key,
            UploadId,
            MultipartUpload: { Parts: completedParts },
        }));

        log('multipart_complete', { parts: completedParts.length });

    } catch (error) {
        // Abort multipart upload on failure to prevent orphaned parts
        log('multipart_abort', { reason: error instanceof Error ? error.message : 'unknown' });
        await r2.send(new AbortMultipartUploadCommand({
            Bucket: bucket,
            Key: key,
            UploadId,
        })).catch(() => { /* best-effort abort */ });

        throw error;
    }
}
