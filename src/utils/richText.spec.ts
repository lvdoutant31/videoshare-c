import { describe, expect, it } from 'vitest';
import { hasRichText, richTextImages, safeRichText } from './richText';

describe('content body', () => {
  it('rejects empty markup but accepts image-only content', () => {
    expect(hasRichText('<p><br>&nbsp;\u200b</p>')).toBe(false);
    expect(hasRichText('<p><img src="https://example.com/a.jpg"></p>')).toBe(true);
    expect(hasRichText('<p>正文</p>')).toBe(true);
    expect(richTextImages('<img src="/media/images/a.png">')).toEqual(['/media/images/a.png']);
    expect(hasRichText('<img src="//evil.example/a.png">')).toBe(false);
  });
  it('preserves blocks, formatting and image order while removing unsafe attributes', () => {
    const clean = safeRichText('<div style="text-align:center" onclick="x()"><strong>标题</strong></div><img src="https://example.com/b.png" onerror="x()"><img src="https://example.com/a.png"><a href="javascript:x()">链接</a>');
    expect(clean).toContain('<div style="text-align: center;">');
    expect(clean).toContain('<strong>标题</strong>');
    expect(clean).not.toMatch(/onclick|onerror|javascript/);
    expect(richTextImages(clean)).toEqual(['https://example.com/b.png', 'https://example.com/a.png']);
  });
});
