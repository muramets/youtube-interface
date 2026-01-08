/**
 * Utility functions for traffic snapshot management
 */

/**
 * Generate a unique snapshot ID.
 * 
 * Format: "snap_" + timestamp + "_v" + versionNumber
 * Example: "snap_1704672000000_v2"
 * 
 * @param timestamp - Unix timestamp in milliseconds
 * @param version - Packaging version number
 * @returns Unique snapshot ID
 */
export function generateSnapshotId(timestamp: number, version: number): string {
    return `snap_${timestamp}_v${version}`;
}

/**
 * Validate CSV file before upload.
 * 
 * Checks:
 * - File type is CSV
 * - File size is within limits
 * 
 * @param file - File to validate
 * @param maxSizeMB - Maximum file size in megabytes (default: 5MB)
 * @returns Error message if invalid, null if valid
 */
export function validateCsvFile(file: File, maxSizeMB: number = 5): string | null {
    // Check file type
    if (!file.name.endsWith('.csv') && file.type !== 'text/csv') {
        return 'Please upload a CSV file';
    }

    // Check file size
    const maxSizeBytes = maxSizeMB * 1024 * 1024;
    if (file.size > maxSizeBytes) {
        return `File size must be less than ${maxSizeMB}MB`;
    }

    return null;
}
