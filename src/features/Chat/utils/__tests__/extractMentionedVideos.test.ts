import { describe, it, expect } from 'vitest';
import { extractMentionedVideos } from '../extractMentionedVideos';
import type { VideoPreviewData } from '../../../Video/types';

const catalog: VideoPreviewData[] = [
    { videoId: 'own-1', youtubeVideoId: 'yt-own-1', title: 'My Video', thumbnailUrl: 'thumb1.jpg', ownership: 'own-published' },
    { videoId: 'own-2', title: 'Draft Video', ownership: 'own-draft' },
    { videoId: 'comp-1', title: 'Competitor Video', thumbnailUrl: 'thumb3.jpg', channelTitle: 'Other Channel', ownership: 'competitor' },
];

describe('extractMentionedVideos', () => {
    it('extracts a single vid:// mention', () => {
        const text = 'Check out [My Video](vid://own-1)';
        const result = extractMentionedVideos(text, catalog);
        expect(result).toHaveLength(1);
        expect(result[0].videoId).toBe('own-1');
        expect(result[0].title).toBe('My Video');
    });

    it('extracts multiple vid:// mentions', () => {
        const text = 'Compare [My Video](vid://own-1) with [Competitor Video](vid://comp-1)';
        const result = extractMentionedVideos(text, catalog);
        expect(result).toHaveLength(2);
        const ids = result.map(v => v.videoId);
        expect(ids).toContain('own-1');
        expect(ids).toContain('comp-1');
    });

    it('deduplicates same video mentioned multiple times', () => {
        const text = '[My Video](vid://own-1) and again [My Video](vid://own-1)';
        const result = extractMentionedVideos(text, catalog);
        expect(result).toHaveLength(1);
    });

    it('resolves by youtubeVideoId when videoId does not match', () => {
        const text = '[My Video](vid://yt-own-1)';
        const result = extractMentionedVideos(text, catalog);
        expect(result).toHaveLength(1);
        expect(result[0].videoId).toBe('own-1');
    });

    it('returns empty array for text without vid:// links', () => {
        expect(extractMentionedVideos('Hello world', catalog)).toEqual([]);
        expect(extractMentionedVideos('See [link](https://example.com)', catalog)).toEqual([]);
    });

    it('returns empty array when catalog is empty', () => {
        const text = '[My Video](vid://own-1)';
        expect(extractMentionedVideos(text, [])).toEqual([]);
    });

    it('returns empty array for empty text', () => {
        expect(extractMentionedVideos('', catalog)).toEqual([]);
    });

    it('skips vid:// IDs not found in catalog', () => {
        const text = '[Unknown](vid://nonexistent) and [My Video](vid://own-1)';
        const result = extractMentionedVideos(text, catalog);
        expect(result).toHaveLength(1);
        expect(result[0].videoId).toBe('own-1');
    });

    it('preserves all catalog fields in the returned data', () => {
        const text = '[Competitor Video](vid://comp-1)';
        const result = extractMentionedVideos(text, catalog);
        expect(result[0]).toEqual({
            videoId: 'comp-1',
            title: 'Competitor Video',
            thumbnailUrl: 'thumb3.jpg',
            channelTitle: 'Other Channel',
            ownership: 'competitor',
        });
    });
});
