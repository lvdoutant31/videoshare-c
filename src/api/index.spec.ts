import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getContentDetail, getVideoDetail, getDiscover, getRecommendFeed, passwordLogin, register } from './index';

describe('feed API query', () => {
  it('使用已有密码登录和注册接口', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200,
      json: async () => ({ code: 'OK', data: null }) } as Response);
    vi.stubGlobal('fetch', fetchMock);
    await passwordLogin('13800138000', 'SecurePass123!');
    expect(fetchMock).toHaveBeenLastCalledWith('/api/v1/app/auth/password/login', expect.objectContaining({
      method: 'POST', body: JSON.stringify({ phone: '13800138000', password: 'SecurePass123!' })
    }));
    await register('13800138000', 'SecurePass123!', '张三', '2026-08');
    expect(fetchMock).toHaveBeenLastCalledWith('/api/v1/app/auth/register', expect.objectContaining({
      method: 'POST', body: JSON.stringify({ phone: '13800138000', password: 'SecurePass123!', name: '张三', agreementVersion: '2026-08' })
    }));
  });
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('首屏推荐流省略空 cursor 并支持 20 条热搜数据', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ code: 'OK', message: 'ok', data: { items: [], nextCursor: null }, traceId: 't-feed' }),
    } as Response);
    vi.stubGlobal('fetch', fetchMock);

    await getRecommendFeed(null, 20);

    expect(fetchMock).toHaveBeenCalledWith('/api/v1/app/feed/recommend?limit=20', expect.any(Object));
  });

  it('打开详情使用计数入口，列表补充读取保留原接口', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200,
      json: async () => ({ code: 'OK', data: { id: '41' } }) } as Response);
    vi.stubGlobal('fetch', fetchMock);

    await getContentDetail('41');
    expect(fetchMock).toHaveBeenLastCalledWith('/api/v1/app/content/41', expect.any(Object));
    await getVideoDetail('41');
    expect(fetchMock).toHaveBeenLastCalledWith('/api/v1/app/videos/41', expect.any(Object));
  });
  it('forwards search sorting and pagination', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ code: 'OK', data: {} }) } as Response);
    vi.stubGlobal('fetch', fetchMock);
    await getDiscover({ keyword: '设备', limit: 20, page: 2, sort: 'LATEST', contentType: 'VIDEO' });
    const url = new URL(fetchMock.mock.lastCall![0], 'http://localhost');
    expect(Object.fromEntries(url.searchParams)).toEqual({ keyword: '设备', limit: '20', page: '2', sort: 'LATEST', contentType: 'VIDEO' });
  });
});
