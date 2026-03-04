import { describe, it, expect, beforeEach } from 'vitest';
import { enhanceWithThumbnails } from '../thumbnailMiddleware.js';

beforeEach(() => {
    // No mocks needed — enhanceWithThumbnails is now a pure synchronous function
});

// --- Tests ---

describe('enhanceWithThumbnails', () => {
    it('no-op when visualContextUrls is absent', () => {
        const response = { foo: 'bar' };
        const result = enhanceWithThumbnails(response, false);

        expect(result.imageUrls).toHaveLength(0);
        expect(result.cleanedResponse).toBe(response);
        expect(result.blockedCount).toBeUndefined();
    });

    it('no-op when visualContextUrls is empty array', () => {
        const response = { visualContextUrls: [] };
        const result = enhanceWithThumbnails(response, false);

        expect(result.imageUrls).toHaveLength(0);
        expect(result.cleanedResponse).toBe(response);
    });

    it('extracts URLs when <15 URLs and approved=false', () => {
        const urls = ['url1', 'url2', 'url3'];
        const response = { title: 'test', visualContextUrls: urls };
        const result = enhanceWithThumbnails(response, false);

        expect(result.imageUrls).toEqual(urls);
        expect(result.cleanedResponse).not.toHaveProperty('visualContextUrls');
        expect(result.cleanedResponse).toHaveProperty('title', 'test');
        expect(result.blockedCount).toBeUndefined();
    });

    it('blocks when >=15 URLs and approved=false', () => {
        const urls = Array.from({ length: 20 }, (_, i) => `url${i}`);
        const response = { visualContextUrls: urls };

        const result = enhanceWithThumbnails(response, false);

        expect(result.imageUrls).toHaveLength(0);
        expect(result.blockedCount).toBe(20);
        expect(result.cleanedResponse).not.toHaveProperty('visualContextUrls');
        expect(result.cleanedResponse._systemNote).toContain('20');
    });

    it('extracts all URLs when >=15 URLs and approved=true', () => {
        const urls = Array.from({ length: 20 }, (_, i) => `url${i}`);
        const response = { visualContextUrls: urls };
        const result = enhanceWithThumbnails(response, true);

        expect(result.imageUrls).toHaveLength(20);
        expect(result.imageUrls).toEqual(urls);
        expect(result.blockedCount).toBeUndefined();
        expect(result.cleanedResponse).not.toHaveProperty('visualContextUrls');
    });

    it('strips visualContextUrls from cleanedResponse even when URLs exist', () => {
        const urls = ['url1', 'url2'];
        const response = { title: 'test', visualContextUrls: urls, extra: 42 };
        const result = enhanceWithThumbnails(response, false);

        expect(result.cleanedResponse).not.toHaveProperty('visualContextUrls');
        expect(result.cleanedResponse).toHaveProperty('title', 'test');
        expect(result.cleanedResponse).toHaveProperty('extra', 42);
    });
});
