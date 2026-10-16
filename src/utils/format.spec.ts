import { describe, expect, it } from 'vitest';
import { formatCount, formatDateTime, formatDuration, timeAgo } from './format';

describe('formatCount', () => {
  it('小于一千原样返回', () => {
    expect(formatCount(0)).toBe('0');
    expect(formatCount(999)).toBe('999');
  });
  it('千单位转为 k', () => {
    expect(formatCount(1260)).toBe('1.3k');
    expect(formatCount(1520)).toBe('1.5k');
  });
  it('万以上转为 w，保留一位并去掉末尾 .0', () => {
    expect(formatCount(128460)).toBe('12.8w');
    expect(formatCount(150000)).toBe('15w');
  });
});

describe('formatDuration', () => {
  it('分:秒', () => {
    expect(formatDuration(86400)).toBe('01:26');
  });
  it('时:分:秒', () => {
    expect(formatDuration(3723000)).toBe('1:02:03');
  });
  it('空值返回占位', () => {
    expect(formatDuration(null)).toBe('--:--');
    expect(formatDuration(undefined)).toBe('--:--');
  });
});

describe('timeAgo', () => {
  it('一分钟内显示刚刚', () => {
    expect(timeAgo(new Date().toISOString())).toBe('刚刚');
  });
  it('分钟前', () => {
    expect(timeAgo(new Date(Date.now() - 5 * 60_000).toISOString())).toBe('5分钟前');
  });
  it('小时前', () => {
    expect(timeAgo(new Date(Date.now() - 3 * 3600_000).toISOString())).toBe('3小时前');
  });
  it('天前', () => {
    expect(timeAgo(new Date(Date.now() - 2 * 24 * 3600_000).toISOString())).toBe('2天前');
  });
  it('无效时间返回空串', () => {
    expect(timeAgo('not-a-date')).toBe('');
  });
});

describe('formatDateTime', () => {
  it('格式化为 月-日 时:分', () => {
    expect(formatDateTime('2026-08-27T09:05:00.000Z')).toMatch(/^\d{2}-\d{2} \d{2}:\d{2}$/);
  });
});
