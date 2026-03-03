import { describe, it, expect } from 'vitest';
import { parseSuggestedTrafficCsv } from '../csvParser.js';

// Real CSV fixture (trimmed from actual YouTube export)
const FIXTURE_CSV = `Traffic source,Source type,Source title,Impressions,Impressions click-through rate (%),Views,Average view duration,Watch time (hours)
Total,,,3193,1.91,81,0:14:51,20.0669
YT_RELATED.-LsPwvrr1Ko,Content,pov: ur that girl | morning energy boost | that girl playlist 2026,0,,1,0:00:05,0.0015
YT_RELATED.-mA2IH0f3G8,Content,"1 Hour Study With Me🌲Tree View + Lofi Piano🎹,No Breaks",1,100,1,0:00:28,0.0078
YT_RELATED.AITFvyUT3Gc,Content,autumn feels like poetry (calm piano for studying/relaxing),1,0,1,0:04:52,0.0814
YT_RELATED.fnZbuANQxAo,Content,finishing EVERY BOOK SERIES i'm in the middle of IN 24 HOURS…?? 📖🕯️✨ *part 3*,1,100,1,1:02:32,1.0423
YT_RELATED.vLEek3I3wac,Content,Accelerated Learning - Gamma Waves for Focus / Concentration / Memory - Binaural Beats - Focus Music,1,100,1,1:45:38,1.7608`;

describe('parseSuggestedTrafficCsv', () => {
    it('returns correct row count (excludes Total row)', () => {
        const result = parseSuggestedTrafficCsv(FIXTURE_CSV);
        expect(result.rows).toHaveLength(5);
    });

    it('extracts Total row into separate field', () => {
        const result = parseSuggestedTrafficCsv(FIXTURE_CSV);
        expect(result.total).not.toBeNull();
        expect(result.total!.impressions).toBe(3193);
        expect(result.total!.ctr).toBe(1.91);
        expect(result.total!.views).toBe(81);
        expect(result.total!.watchTimeHours).toBe(20.0669);
    });

    it('strips YT_RELATED. prefix from videoId', () => {
        const result = parseSuggestedTrafficCsv(FIXTURE_CSV);
        expect(result.rows[0].videoId).toBe('-LsPwvrr1Ko');
        expect(result.rows[1].videoId).toBe('-mA2IH0f3G8');
    });

    it('handles quoted cell containing comma without splitting it', () => {
        const result = parseSuggestedTrafficCsv(FIXTURE_CSV);
        const quotedRow = result.rows.find(r => r.videoId === '-mA2IH0f3G8');
        expect(quotedRow).toBeDefined();
        expect(quotedRow!.sourceTitle).toBe('1 Hour Study With Me🌲Tree View + Lofi Piano🎹,No Breaks');
    });

    it('sets ctr=null when impressions=0 (empty field)', () => {
        const result = parseSuggestedTrafficCsv(FIXTURE_CSV);
        const zeroImpRow = result.rows.find(r => r.videoId === '-LsPwvrr1Ko');
        expect(zeroImpRow!.impressions).toBe(0);
        expect(zeroImpRow!.ctr).toBeNull();
    });

    it('sets ctr=0 when impressions>0 but ctr field is 0', () => {
        const result = parseSuggestedTrafficCsv(FIXTURE_CSV);
        const zeroCtrlRow = result.rows.find(r => r.videoId === 'AITFvyUT3Gc');
        expect(zeroCtrlRow!.impressions).toBe(1);
        expect(zeroCtrlRow!.ctr).toBe(0);
    });

    it('parses views correctly', () => {
        const result = parseSuggestedTrafficCsv(FIXTURE_CSV);
        for (const row of result.rows) {
            expect(row.views).toBe(1); // all rows in fixture have 1 view
        }
    });

    it('preserves avgViewDuration as raw string', () => {
        const result = parseSuggestedTrafficCsv(FIXTURE_CSV);
        expect(result.rows[2].avgViewDuration).toBe('0:04:52');
        expect(result.rows[4].avgViewDuration).toBe('1:45:38');
    });

    it('parses watchTimeHours as float', () => {
        const result = parseSuggestedTrafficCsv(FIXTURE_CSV);
        expect(result.rows[4].watchTimeHours).toBeCloseTo(1.7608);
    });

    it('preserves emoji and Unicode in title', () => {
        const result = parseSuggestedTrafficCsv(FIXTURE_CSV);
        const emojiRow = result.rows.find(r => r.videoId === 'fnZbuANQxAo');
        expect(emojiRow!.sourceTitle).toContain('📖');
        expect(emojiRow!.sourceTitle).toContain('🕯️');
    });

    it('returns empty rows and null total for empty CSV', () => {
        const result = parseSuggestedTrafficCsv('');
        expect(result.rows).toHaveLength(0);
        expect(result.total).toBeNull();
    });

    it('handles Windows-style CRLF line endings', () => {
        const crlf = FIXTURE_CSV.replace(/\n/g, '\r\n');
        const result = parseSuggestedTrafficCsv(crlf);
        expect(result.rows).toHaveLength(5);
        expect(result.total).not.toBeNull();
    });

    it('ignores non-Content rows (e.g. different source types)', () => {
        const csv = `Traffic source,Source type,Source title,Impressions,Impressions click-through rate (%),Views,Average view duration,Watch time (hours)
Total,,,100,,5,0:01:00,0.1
YT_RELATED.abc123,Content,Test video,1,50,1,0:01:00,0.1
External,external website,some site,5,10,2,0:00:30,0.05`;
        const result = parseSuggestedTrafficCsv(csv);
        expect(result.rows).toHaveLength(1);
        expect(result.rows[0].videoId).toBe('abc123');
    });
});
