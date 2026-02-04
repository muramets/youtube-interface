
import JSZip from 'jszip';


// We need a way to save files. 'file-saver' is commonly used with jszip.
// If not installed, we can implement a simple helper using URL.createObjectURL.
// Let's implement the helper directly to avoid extra deps if possible, or use the one from csvUtils if it exists.
// Actually, I'll rely on a simple internal helper since `downloadCsv` uses one too.

const downloadBlob = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.onclick = (e) => e.stopPropagation(); // Stop leak to document listeners
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
};

export interface ImageToZip {
    id: string; // Used for filename
    url: string; // Image URL
}

/**
 * Fetches an image blob, trying to upgrade to maxresdefault if it's a YouTube URL.
 */
export const fetchImageBlob = async (imageUrl: string): Promise<Blob> => {
    let response: Response | null = null;

    // 1. Try to upgrade to maxresdefault if it's a YouTube URL
    if (imageUrl.includes('i.ytimg.com/vi/')) {
        const maxResUrl = imageUrl.replace(/\/([a-z]+default)(_live)?\.jpg$/, '/maxresdefault.jpg');
        if (maxResUrl !== imageUrl) {
            try {
                // Try fetching the high-res version
                const maxResResponse = await fetch(maxResUrl, { credentials: 'omit' });
                if (maxResResponse.ok) {
                    response = maxResResponse;
                }
            } catch {
                // Ignore, fallback to original
            }
        }
    }

    // 2. Fallback to original URL if no high-res response
    if (!response) {
        response = await fetch(imageUrl, { cache: 'force-cache', credentials: 'omit' });
    }

    if (!response.ok) throw new Error(`Failed to fetch ${imageUrl}`);

    return await response.blob();
};

/**
 * Downloads a single image directly.
 */
export const downloadImageDirect = async (img: ImageToZip, filename?: string) => {
    try {
        const blob = await fetchImageBlob(img.url);
        const finalFilename = filename || `${img.id}.jpg`;
        downloadBlob(blob, finalFilename);
    } catch (error) {
        console.error(`Error downloading image for ${img.id}:`, error);
        throw error;
    }
};

/**
 * Downloads a list of images as a single ZIP file.
 * Uses browser cache if available (via fetch).
 */
export const downloadImagesAsZip = async (images: ImageToZip[], zipFilename: string) => {
    const zip = new JSZip();
    const folder = zip.folder("images");

    if (!folder) {
        console.error("Failed to create ZIP folder");
        return;
    }

    // Process in parallel
    const promises = images.map(async (img) => {
        try {
            const blob = await fetchImageBlob(img.url);
            // Add to zip
            // Filename: videoId.jpg
            folder.file(`${img.id}.jpg`, blob);
        } catch (error) {
            console.error(`Error downloading image for ${img.id}:`, error);
        }
    });

    await Promise.all(promises);

    // Generate ZIP
    const content = await zip.generateAsync({ type: "blob" });

    // Download
    downloadBlob(content, zipFilename);
};
