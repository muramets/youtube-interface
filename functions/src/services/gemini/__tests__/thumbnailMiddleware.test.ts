import { describe, it, expect, vi, beforeEach } from 'vitest';
import { enhanceWithThumbnails } from '../thumbnailMiddleware.js';
import type { ThumbnailCache } from '../thumbnails.js';

// --- Mock fetchThumbnailParts ---

vi.mock('../thumbnails.js', () => ({
    fetchThumbnailParts: vi.fn(),
}));

import { fetchThumbnailParts } from '../thumbnails.js';
const mockFetch = vi.mocked(fetchThumbnailParts);

const API_KEY = 'test-key';
const EMPTY_CACHE: ThumbnailCache = {};

const makePart = (url: string) => ({ fileData: { fileUri: `gemini://${url}`, mimeType: 'image/jpeg' } });

beforeEach(() => {
    vi.clearAllMocks();
});

// --- Tests ---

describe('enhanceWithThumbnails', () => {
    it('no-op when visualContextUrls is absent', async () => {
        const response = { foo: 'bar' };
        const result = await enhanceWithThumbnails(response, false, API_KEY, EMPTY_CACHE);

        expect(result.imageParts).toHaveLength(0);
        expect(result.cleanedResponse).toBe(response);
        expect(result.blockedCount).toBeUndefined();
        expect(mockFetch).not.toHaveBeenCalled();
    });

    it('no-op when visualContextUrls is empty array', async () => {
        const response = { visualContextUrls: [] };
        const result = await enhanceWithThumbnails(response, false, API_KEY, EMPTY_CACHE);

        expect(result.imageParts).toHaveLength(0);
        expect(result.cleanedResponse).toBe(response);
        expect(mockFetch).not.toHaveBeenCalled();
    });

    it('fetches when <15 URLs and approved=false', async () => {
        const urls = ['url1', 'url2', 'url3'];
        const parts = urls.map(makePart);
        const updatedCache: ThumbnailCache = {
            url1: { fileUri: 'gemini://url1', mimeType: 'image/jpeg', uploadedAt: Date.now() },
            url2: { fileUri: 'gemini://url2', mimeType: 'image/jpeg', uploadedAt: Date.now() },
            url3: { fileUri: 'gemini://url3', mimeType: 'image/jpeg', uploadedAt: Date.now() },
        };
        mockFetch.mockResolvedValue({ parts, updatedCache });

        const response = { title: 'test', visualContextUrls: urls };
        const result = await enhanceWithThumbnails(response, false, API_KEY, EMPTY_CACHE);

        expect(mockFetch).toHaveBeenCalledWith(API_KEY, urls, EMPTY_CACHE);
        expect(result.imageParts).toEqual(parts);
        expect(result.cleanedResponse).not.toHaveProperty('visualContextUrls');
        expect(result.cleanedResponse).toHaveProperty('title', 'test');
        expect(result.blockedCount).toBeUndefined();
    });

    it('blocks when >=15 URLs and approved=false', async () => {
        const urls = Array.from({ length: 20 }, (_, i) => `url${i}`);
        const response = { visualContextUrls: urls };

        const result = await enhanceWithThumbnails(response, false, API_KEY, EMPTY_CACHE);

        expect(mockFetch).not.toHaveBeenCalled();
        expect(result.imageParts).toHaveLength(0);
        expect(result.blockedCount).toBe(20);
        expect(result.cleanedResponse).not.toHaveProperty('visualContextUrls');
        expect(result.cleanedResponse._systemNote).toContain('20');
    });

    it('fetches all when >=15 URLs and approved=true', async () => {
        const urls = Array.from({ length: 20 }, (_, i) => `url${i}`);
        const parts = urls.map(makePart);
        const updatedCache: ThumbnailCache = Object.fromEntries(
            urls.map(u => [u, { fileUri: `gemini://${u}`, mimeType: 'image/jpeg', uploadedAt: Date.now() }])
        );
        mockFetch.mockResolvedValue({ parts, updatedCache });

        const response = { visualContextUrls: urls };
        const result = await enhanceWithThumbnails(response, true, API_KEY, EMPTY_CACHE);

        expect(mockFetch).toHaveBeenCalledWith(API_KEY, urls, EMPTY_CACHE);
        expect(result.imageParts).toHaveLength(20);
        expect(result.blockedCount).toBeUndefined();
        expect(result.cleanedResponse).not.toHaveProperty('visualContextUrls');
    });

    it('adds _failedThumbnails when some uploads fail (url not in updatedCache)', async () => {
        const urls = ['url1', 'url2', 'url3'];
        const parts = [makePart('url1'), makePart('url3')]; // url2 failed
        const updatedCache: ThumbnailCache = {
            url1: { fileUri: 'gemini://url1', mimeType: 'image/jpeg', uploadedAt: Date.now() },
            url3: { fileUri: 'gemini://url3', mimeType: 'image/jpeg', uploadedAt: Date.now() },
            // url2 absent — failed
        };
        mockFetch.mockResolvedValue({ parts, updatedCache });

        const response = { visualContextUrls: urls };
        const result = await enhanceWithThumbnails(response, false, API_KEY, EMPTY_CACHE);

        expect(result.imageParts).toHaveLength(2);
        expect(result.cleanedResponse._failedThumbnails).toBe(1);
    });

    it('calls reportProgress before fetching', async () => {
        const urls = ['url1'];
        const callOrder: string[] = [];

        const progress = vi.fn(() => { callOrder.push('progress'); });
        mockFetch.mockImplementation(async () => {
            callOrder.push('fetch');
            return {
                parts: [makePart('url1')],
                updatedCache: {
                    url1: { fileUri: 'gemini://url1', mimeType: 'image/jpeg', uploadedAt: Date.now() },
                },
            };
        });

        const response = { visualContextUrls: urls };
        await enhanceWithThumbnails(response, false, API_KEY, EMPTY_CACHE, progress);

        expect(progress).toHaveBeenCalledWith('Uploading 1 thumbnail...');
        expect(callOrder).toEqual(['progress', 'fetch']);
    });
});
