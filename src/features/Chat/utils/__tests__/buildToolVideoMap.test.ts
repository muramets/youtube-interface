import { describe, it, expect } from 'vitest';
import { buildToolVideoMap } from '../buildToolVideoMap';
import type { ChatMessage } from '../../../../core/types/chat/chat';

function msg(toolCalls: ChatMessage['toolCalls']): ChatMessage {
    return {
        id: '1',
        role: 'model',
        text: '',
        createdAt: { toDate: () => new Date() } as never,
        toolCalls,
    };
}

describe('buildToolVideoMap', () => {
    it('extracts video from mentionVideo result', () => {
        const messages = [msg([{
            name: 'mentionVideo',
            args: { videoId: 'abc' },
            result: { found: true, videoId: 'abc', title: 'Test', thumbnailUrl: 'http://img.jpg', ownership: 'own-published', channelTitle: 'My Channel' },
        }])];

        const map = buildToolVideoMap(messages);

        expect(map.size).toBe(1);
        const v = map.get('abc')!;
        expect(v.title).toBe('Test');
        expect(v.thumbnailUrl).toBe('http://img.jpg');
        expect(v.ownership).toBe('own-published');
        expect(v.channelTitle).toBe('My Channel');
    });

    it('extracts videos from browseChannelVideos result', () => {
        const messages = [msg([{
            name: 'browseChannelVideos',
            args: {},
            result: {
                videos: [
                    { videoId: 'v1', title: 'Video 1', thumbnailUrl: 'http://t1.jpg', viewCount: 1000, publishedAt: '2024-01-01' },
                    { videoId: 'v2', title: 'Video 2', thumbnailUrl: 'http://t2.jpg', viewCount: 2000, publishedAt: '2024-02-01' },
                ],
            },
        }])];

        const map = buildToolVideoMap(messages);

        expect(map.size).toBe(2);
        expect(map.get('v1')!.viewCount).toBe('1000');
        expect(map.get('v2')!.publishedAt).toBe('2024-02-01');
    });

    it('extracts videos from getMultipleVideoDetails result', () => {
        const messages = [msg([{
            name: 'getMultipleVideoDetails',
            args: { videoIds: ['v1'] },
            result: {
                videos: [{
                    videoId: 'v1',
                    title: 'Detailed',
                    thumbnailUrl: 'http://t1.jpg',
                    viewCount: 5000,
                    publishedAt: '2024-03-01',
                    duration: 'PT10M',
                    description: 'A description',
                    tags: ['tag1', 'tag2'],
                    ownership: 'own-published',
                    channelTitle: 'Ch',
                }],
            },
        }])];

        const map = buildToolVideoMap(messages);
        const v = map.get('v1')!;

        expect(v.duration).toBe('PT10M');
        expect(v.description).toBe('A description');
        expect(v.tags).toEqual(['tag1', 'tag2']);
        expect(v.viewCount).toBe('5000');
    });

    it('merges data from multiple tools — fills gaps without overwriting', () => {
        const messages = [msg([
            {
                name: 'browseChannelVideos',
                args: {},
                result: {
                    videos: [{ videoId: 'v1', title: 'Browse Title', thumbnailUrl: 'http://browse.jpg', viewCount: 999, publishedAt: '2024-01-01' }],
                },
            },
            {
                name: 'mentionVideo',
                args: { videoId: 'v1' },
                result: { found: true, videoId: 'v1', title: 'Mention Title', thumbnailUrl: 'http://mention.jpg', ownership: 'own-published', channelTitle: 'My Ch' },
            },
        ])];

        const map = buildToolVideoMap(messages);
        const v = map.get('v1')!;

        // browse set first: title and thumbnailUrl kept from browse
        expect(v.title).toBe('Browse Title');
        expect(v.thumbnailUrl).toBe('http://browse.jpg');
        // mention fills gaps: ownership and channelTitle
        expect(v.ownership).toBe('own-published');
        expect(v.channelTitle).toBe('My Ch');
        // browse data preserved
        expect(v.viewCount).toBe('999');
        expect(v.publishedAt).toBe('2024-01-01');
    });

    it('skips mentionVideo with found=false', () => {
        const messages = [msg([{
            name: 'mentionVideo',
            args: { videoId: 'missing' },
            result: { found: false, videoId: 'missing', error: 'Not found' },
        }])];

        expect(buildToolVideoMap(messages).size).toBe(0);
    });

    it('skips tool calls without result', () => {
        const messages = [msg([{
            name: 'mentionVideo',
            args: { videoId: 'abc' },
            result: undefined,
        }])];

        expect(buildToolVideoMap(messages).size).toBe(0);
    });

    it('handles messages without toolCalls', () => {
        const messages: ChatMessage[] = [{
            id: '1',
            role: 'user',
            text: 'hello',
            createdAt: { toDate: () => new Date() } as never,
        }];

        expect(buildToolVideoMap(messages).size).toBe(0);
    });

    it('stringifies numeric viewCount', () => {
        const messages = [msg([{
            name: 'browseChannelVideos',
            args: {},
            result: { videos: [{ videoId: 'v1', title: 'T', viewCount: 120776 }] },
        }])];

        expect(buildToolVideoMap(messages).get('v1')!.viewCount).toBe('120776');
    });
});
