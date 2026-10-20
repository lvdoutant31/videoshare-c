import { beforeEach, describe, expect, it, vi } from 'vitest';
import { shuffleFeedPage } from './feedOrder';

describe('shuffleFeedPage', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  it('reorders a batch without dropping or duplicating items', () => {
    const items = [{ id: '1' }, { id: '2' }, { id: '3' }, { id: '4' }];
    const result = shuffleFeedPage(items, { random: () => 0 });

    expect(result.map((item) => item.id)).toEqual(['2', '3', '4', '1']);
    expect(new Set(result.map((item) => item.id)).size).toBe(items.length);
  });

  it('changes the first-page order when reopening yields the previous sequence', () => {
    const items = [{ id: '1' }, { id: '2' }, { id: '3' }];
    const random = vi.fn(() => 0.999);

    const first = shuffleFeedPage(items, { isFirstPage: true, random });
    const reopened = shuffleFeedPage(items, { isFirstPage: true, random });

    expect(reopened.map((item) => item.id)).not.toEqual(first.map((item) => item.id));
    expect(new Set(reopened.map((item) => item.id)).size).toBe(items.length);
  });

  it('does not reorder later pages through the first-page repeat guard', () => {
    const items = [{ id: '1' }, { id: '2' }, { id: '3' }];
    shuffleFeedPage(items, { isFirstPage: true, random: () => 0.999 });

    const nextPage = shuffleFeedPage(items, { random: () => 0.999 });

    expect(nextPage.map((item) => item.id)).toEqual(['1', '2', '3']);
  });
});
