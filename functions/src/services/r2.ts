/**
 * r2.ts — Cloudflare R2 client for signed URL generation
 *
 * Uses AWS S3 SDK (R2 is S3-compatible) with credentials from
 * Firebase Secret Manager (defineSecret).
 */

import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

let _client: S3Client | null = null;

export function getR2Client(
    endpoint: string,
    accessKeyId: string,
    secretAccessKey: string,
): S3Client {
    if (!_client) {
        _client = new S3Client({
            region: 'auto',
            endpoint,
            credentials: { accessKeyId, secretAccessKey },
        });
    }
    return _client;
}

/**
 * Generate a signed download URL for a file in R2.
 * URL is valid for the specified duration (default 24 hours).
 */
export async function getR2DownloadUrl(
    client: S3Client,
    bucket: string,
    key: string,
    expiresInSeconds = 86400,
): Promise<string> {
    return getSignedUrl(
        client,
        new GetObjectCommand({ Bucket: bucket, Key: key }),
        { expiresIn: expiresInSeconds },
    );
}
