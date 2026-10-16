import { describe, expect, it } from 'vitest';
import { resolveCoverUrl } from './media';

describe('resolveCoverUrl', () => {
  it('保留真实封面并让缺失封面回退到视频预览', () => {
    expect(resolveCoverUrl('https://cdn.example/cover.jpg')).toBe('https://cdn.example/cover.jpg');
    expect(resolveCoverUrl(null)).toBeUndefined();
  });
});
