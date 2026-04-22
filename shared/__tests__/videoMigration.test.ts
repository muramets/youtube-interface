// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { planVideoMigration, replaceChannelInPath } from '../videoMigration';
import type { VideoMigrationInput } from '../videoMigration';

const SRC = 'mIXthaNROSxAFs8s6wQp';
const DST = 'sjh8jqliTFosZ2RDWRuj';

const baseInput = (overrides: Partial<VideoMigrationInput> = {}): VideoMigrationInput => ({
    sourceChannelId: SRC,
    destChannelId: DST,
    mainDoc: {},
    subcollections: {},
    ...overrides,
});

describe('replaceChannelInPath', () => {
    it('replaces raw path segment', () => {
        const path = `users/uid/channels/${SRC}/videos/v1/file.jpg`;
        expect(replaceChannelInPath(path, SRC, DST)).toBe(
            `users/uid/channels/${DST}/videos/v1/file.jpg`,
        );
    });

    it('replaces url-encoded segment in download URL', () => {
        const url =
            `https://firebasestorage.googleapis.com/v0/b/bucket/o/users%2Fuid%2Fchannels%2F${SRC}%2Fvideos%2Fv1%2Ffile.jpg?alt=media`;
        expect(replaceChannelInPath(url, SRC, DST)).toBe(
            `https://firebasestorage.googleapis.com/v0/b/bucket/o/users%2Fuid%2Fchannels%2F${DST}%2Fvideos%2Fv1%2Ffile.jpg?alt=media`,
        );
    });

    it('leaves a bare channelId value alone (no path separators around it)', () => {
        // YouTube channelId field stores SRC as a plain value — must NOT be replaced
        expect(replaceChannelInPath(SRC, SRC, DST)).toBe(SRC);
    });

    it('leaves a string that contains channelId as a substring inside a longer token', () => {
        const value = `prefix-${SRC}-suffix`;
        expect(replaceChannelInPath(value, SRC, DST)).toBe(value);
    });

    it('replaces multiple occurrences in the same string', () => {
        const path = `/${SRC}/x/${SRC}/y`;
        expect(replaceChannelInPath(path, SRC, DST)).toBe(`/${DST}/x/${DST}/y`);
    });

    it('returns the input untouched when channelId is not present at all', () => {
        const value = 'no-channel-here/just/a/path';
        expect(replaceChannelInPath(value, SRC, DST)).toBe(value);
    });
});

describe('planVideoMigration validation', () => {
    it('throws when source equals dest', () => {
        expect(() =>
            planVideoMigration(baseInput({ sourceChannelId: SRC, destChannelId: SRC })),
        ).toThrow(/must differ/);
    });

    it('throws when sourceChannelId is empty', () => {
        expect(() =>
            planVideoMigration(baseInput({ sourceChannelId: '' })),
        ).toThrow(/required/);
    });

    it('throws when destChannelId is empty', () => {
        expect(() =>
            planVideoMigration(baseInput({ destChannelId: '' })),
        ).toThrow(/required/);
    });
});

describe('planVideoMigration main doc rewriting', () => {
    it('rewrites customImage download URL', () => {
        const input = baseInput({
            mainDoc: {
                id: 'custom-1',
                customImage: `https://firebasestorage.googleapis.com/v0/b/bucket/o/users%2Fuid%2Fchannels%2F${SRC}%2Fvideos%2Fv1%2Fimg.jpg?alt=media&token=abc`,
            },
        });
        const plan = planVideoMigration(input);
        expect(plan.mainDoc.customImage).toBe(
            `https://firebasestorage.googleapis.com/v0/b/bucket/o/users%2Fuid%2Fchannels%2F${DST}%2Fvideos%2Fv1%2Fimg.jpg?alt=media&token=abc`,
        );
    });

    it('preserves YouTube channelId field (bare string, no path separators)', () => {
        const input = baseInput({
            mainDoc: {
                id: 'custom-1',
                channelId: 'UCoPoL0ja0RlKDPHC9nn12ZA', // YT-side channel ID — different value, must not change
                channelTitle: 'Cordelia Wilmore',
            },
        });
        const plan = planVideoMigration(input);
        expect(plan.mainDoc.channelId).toBe('UCoPoL0ja0RlKDPHC9nn12ZA');
        expect(plan.mainDoc.channelTitle).toBe('Cordelia Wilmore');
    });

    it('does NOT mutate the original input', () => {
        const original = {
            customImage: `users/uid/channels/${SRC}/videos/v1/img.jpg`,
        };
        const input = baseInput({ mainDoc: original });
        planVideoMigration(input);
        expect(original.customImage).toBe(`users/uid/channels/${SRC}/videos/v1/img.jpg`);
    });

    it('rewrites paths inside nested arrays (e.g. gallerySources)', () => {
        const input = baseInput({
            mainDoc: {
                gallerySources: [
                    { url: `users/uid/channels/${SRC}/videos/v1/cover.jpg`, kind: 'image' },
                ],
            },
        });
        const plan = planVideoMigration(input);
        const gallery = plan.mainDoc.gallerySources as Array<{ url: string; kind: string }>;
        expect(gallery[0].url).toBe(`users/uid/channels/${DST}/videos/v1/cover.jpg`);
        expect(gallery[0].kind).toBe('image');
    });
});

describe('planVideoMigration subcollection rewriting', () => {
    it('rewrites snapshot[i].storagePath in traffic/main', () => {
        const input = baseInput({
            subcollections: {
                traffic: {
                    main: {
                        snapshots: [
                            {
                                id: 'snap1',
                                storagePath: `users/uid/channels/${SRC}/videos/v1/snapshots/snap_1.csv`,
                                version: 1,
                            },
                            {
                                id: 'snap2',
                                storagePath: `users/uid/channels/${SRC}/videos/v1/snapshots/snap_2.csv`,
                                version: 1,
                            },
                        ],
                        lastUpdated: 12345,
                    },
                },
            },
        });
        const plan = planVideoMigration(input);
        const snaps = (plan.subcollections.traffic.main.snapshots) as Array<{
            id: string;
            storagePath: string;
        }>;
        expect(snaps[0].storagePath).toBe(`users/uid/channels/${DST}/videos/v1/snapshots/snap_1.csv`);
        expect(snaps[1].storagePath).toBe(`users/uid/channels/${DST}/videos/v1/snapshots/snap_2.csv`);
        expect(plan.subcollections.traffic.main.lastUpdated).toBe(12345);
    });

    it('handles a snapshot without storagePath (legacy data) gracefully', () => {
        const input = baseInput({
            subcollections: {
                trafficSource: {
                    main: {
                        snapshots: [
                            { id: 'noop', version: 1 },
                            {
                                id: 'withPath',
                                storagePath: `users/uid/channels/${SRC}/videos/v1/trafficSources/ts_1.csv`,
                            },
                        ],
                    },
                },
            },
        });
        const plan = planVideoMigration(input);
        const snaps = plan.subcollections.trafficSource.main.snapshots as Array<{
            id: string;
            storagePath?: string;
        }>;
        expect(snaps[0].id).toBe('noop');
        expect(snaps[0].storagePath).toBeUndefined();
        expect(snaps[1].storagePath).toBe(`users/uid/channels/${DST}/videos/v1/trafficSources/ts_1.csv`);
    });

    it('preserves empty subcollections map', () => {
        const plan = planVideoMigration(baseInput({ subcollections: {} }));
        expect(plan.subcollections).toEqual({});
    });

    it('preserves a subcollection with a doc that has no snapshots field', () => {
        const input = baseInput({
            subcollections: {
                someSub: {
                    onlyMeta: { lastUpdated: 999 },
                },
            },
        });
        const plan = planVideoMigration(input);
        expect(plan.subcollections.someSub.onlyMeta.lastUpdated).toBe(999);
    });
});
