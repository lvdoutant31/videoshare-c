import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, createIdempotencyKey, isAuthenticated, request, setAuthRequiredHandler, tokenStore } from './http';
import { ErrorCode } from './types';

function jsonResponse(ok: boolean, status: number, payload: unknown): Response {
  return { ok, status, json: async () => payload } as unknown as Response;
}

describe('http client', () => {
  beforeEach(() => {
    tokenStore.clear();
    vi.unstubAllGlobals();
  });

  it('注入 Bearer token 并拼接 /api/v1 前缀', async () => {
    tokenStore.set('abc');
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(true, 200, { code: 'OK', message: '', data: { ok: 1 }, traceId: 't-1' }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const data = await request<{ ok: number }>('/app/me');
    expect(data).toEqual({ ok: 1 });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/api/v1/app/me');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer abc');
    expect(init.credentials).toBe('include');
  });

  it('写入请求携带 Content-Type 与 Idempotency-Key', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(true, 200, { code: 'OK', message: '', data: null, traceId: 't-2' }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await request('/app/videos/1/like', { method: 'PUT', body: { active: true }, idempotencyKey: 'k-1' });
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('application/json');
    expect((init.headers as Record<string, string>)['Idempotency-Key']).toBe('k-1');
    expect(init.body).toBe('{"active":true}');
  });

  it('业务码非 OK 时抛 ApiError 并携带稳定错误码', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse(false, 422, { code: 'SENSITIVE_CONTENT', message: '命中敏感词', data: null, traceId: 't-3' }),
      ),
    );
    await expect(request('/app/videos/1/comments', { method: 'POST' })).rejects.toMatchObject({
      code: ErrorCode.SENSITIVE_CONTENT,
      httpStatus: 422,
      traceId: 't-3',
    });
  });

  it('AUTH_REQUIRED 时清 token 并触发全局登录回调', async () => {
    tokenStore.set('old-token');
    const handler = vi.fn();
    setAuthRequiredHandler(handler);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse(false, 401, { code: 'AUTH_REQUIRED', message: '未登录', data: null, traceId: 't-4' })),
    );

    await expect(request('/app/me')).rejects.toBeInstanceOf(ApiError);
    expect(handler).toHaveBeenCalledOnce();
    expect(tokenStore.get()).toBeNull();
  });

  it('非 JSON 响应（网关错误页）返回 HTTP_ERROR', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 502, json: async () => { throw new Error('not json'); } } as unknown as Response),
    );
    await expect(request('/app/feed/recommend')).rejects.toMatchObject({ code: 'HTTP_ERROR', httpStatus: 502 });
  });

  it('isAuthenticated 与 token 联动', () => {
    expect(isAuthenticated()).toBe(false);
    tokenStore.set('t');
    expect(isAuthenticated()).toBe(true);
  });

  it('createIdempotencyKey 生成非空唯一键', () => {
    expect(createIdempotencyKey()).toBeTruthy();
    expect(createIdempotencyKey()).not.toBe(createIdempotencyKey());
  });

  it('reports multipart progress and keeps authentication and response parsing', async () => {
    tokenStore.set('upload-token');
    const xhr = { open: vi.fn(), setRequestHeader: vi.fn(), send: vi.fn(), withCredentials: false,
      upload: {} as { onprogress: (event: Partial<ProgressEvent>) => void },
      status: 200, responseText: JSON.stringify({ code: 'OK', data: { id: '123' } }),
      onload: () => {}, onloadend: () => {} };
    vi.stubGlobal('XMLHttpRequest', vi.fn(function () { return xhr; }));
    const progress = vi.fn();
    const body = new FormData(); body.append('file', new File(['video'], 'video.mp4'));
    const result = request('/app/content', { method: 'POST', body, onUploadProgress: progress });
    expect(xhr.open).toHaveBeenCalledWith('POST', expect.stringContaining('/api/v1/app/content'));
    expect(xhr.setRequestHeader).toHaveBeenCalledWith('Authorization', 'Bearer upload-token');
    expect(xhr.setRequestHeader).not.toHaveBeenCalledWith('Content-Type', expect.anything());
    expect(xhr.withCredentials).toBe(true);
    expect(xhr.send).toHaveBeenCalledWith(body);
    xhr.upload.onprogress({ lengthComputable: false, loaded: 1, total: 0 });
    expect(progress).not.toHaveBeenCalled();
    xhr.upload.onprogress({ lengthComputable: true, loaded: 45, total: 100 });
    expect(progress).toHaveBeenCalledWith(45);
    xhr.onload(); xhr.onloadend();
    await expect(result).resolves.toEqual({ id: '123' });
  });

  it.each([
    [401, '{"code":"TOKEN_EXPIRED","message":"登录已失效"}', 'TOKEN_EXPIRED'],
    [502, '<html>gateway</html>', 'HTTP_ERROR'],
  ])('handles upload HTTP %s through the same error contract', async (status, responseText, code) => {
    const xhr = { open: vi.fn(), setRequestHeader: vi.fn(), send: vi.fn(), upload: {}, status, responseText, onload: () => {} };
    vi.stubGlobal('XMLHttpRequest', vi.fn(function () { return xhr; }));
    const handler = vi.fn(); setAuthRequiredHandler(handler); tokenStore.set('token');
    const result = request('/app/content', { method: 'POST', body: new FormData(), onUploadProgress: vi.fn() });
    const assertion = expect(result).rejects.toMatchObject({ code, httpStatus: status });
    xhr.onload();
    await assertion;
    expect(handler).toHaveBeenCalledTimes(status === 401 ? 1 : 0);
  });
});
