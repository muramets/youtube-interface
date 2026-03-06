import { describe, it, expect } from 'vitest';
import { normalizeMarkdown } from '../normalizeMarkdown';

describe('normalizeMarkdown', () => {
  it('splits a heading glued to a table header', () => {
    const input = [
      '### Хитов было не два, а три| Дата | Видео | Просмотры |',
      '|------|-------|-----------|',
      '| 30 окт | video A | **120,776** |',
    ].join('\n');

    const result = normalizeMarkdown(input);

    expect(result).toBe([
      '### Хитов было не два, а три',
      '',
      '| Дата | Видео | Просмотры |',
      '|------|-------|-----------|',
      '| 30 окт | video A | **120,776** |',
    ].join('\n'));
  });

  it('splits plain text glued to a table header', () => {
    const input = [
      'Some text| A | B |',
      '|---|---|',
      '| 1 | 2 |',
    ].join('\n');

    const result = normalizeMarkdown(input);

    expect(result).toBe([
      'Some text',
      '',
      '| A | B |',
      '|---|---|',
      '| 1 | 2 |',
    ].join('\n'));
  });

  it('does not modify a valid table', () => {
    const input = [
      '| A | B |',
      '|---|---|',
      '| 1 | 2 |',
    ].join('\n');

    expect(normalizeMarkdown(input)).toBe(input);
  });

  it('does not modify plain text without tables', () => {
    const input = 'Hello world\nThis is a paragraph.';
    expect(normalizeMarkdown(input)).toBe(input);
  });

  it('does not touch pipes inside code blocks', () => {
    const input = [
      '```',
      'text| A | B |',
      '|---|---|',
      '| 1 | 2 |',
      '```',
    ].join('\n');

    expect(normalizeMarkdown(input)).toBe(input);
  });

  it('handles table with alignment markers in separator', () => {
    const input = [
      'Results| Left | Center | Right |',
      '|:-----|:------:|------:|',
      '| a | b | c |',
    ].join('\n');

    const result = normalizeMarkdown(input);

    expect(result).toBe([
      'Results',
      '',
      '| Left | Center | Right |',
      '|:-----|:------:|------:|',
      '| a | b | c |',
    ].join('\n'));
  });

  it('preserves text after a table', () => {
    const input = [
      'Intro| A | B |',
      '|---|---|',
      '| 1 | 2 |',
      '',
      'Conclusion paragraph.',
    ].join('\n');

    const result = normalizeMarkdown(input);

    expect(result).toContain('Intro\n\n| A | B |');
    expect(result).toContain('Conclusion paragraph.');
  });
});
