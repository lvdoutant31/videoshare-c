import { describe, expect, it } from 'vitest';
import { countAfter, paginate } from './index';

describe('paginate（游标分页契约）', () => {
  const items = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

  it('首页返回前 limit 条并给出下一游标', () => {
    const page = paginate(items, null, 5);
    expect(page.items).toEqual([1, 2, 3, 4, 5]);
    expect(page.nextCursor).toBe('5');
  });

  it('游标分页不重复', () => {
    const first = paginate(items, null, 5);
    const second = paginate(items, first.nextCursor, 5);
    expect(second.items).toEqual([6, 7, 8, 9, 10]);
    expect(second.nextCursor).toBeNull();
  });

  it('超出边界返回空列表与 null 游标', () => {
    const page = paginate(items, '99', 5);
    expect(page.items).toEqual([]);
    expect(page.nextCursor).toBeNull();
  });
});

describe('countAfter（互动计数权威值）', () => {
  it('点赞 +1', () => {
    expect(countAfter(true, 1260)).toEqual({ active: true, count: 1261 });
  });
  it('取消点赞 -1，不低于 0', () => {
    expect(countAfter(false, 0)).toEqual({ active: false, count: 0 });
  });
});
