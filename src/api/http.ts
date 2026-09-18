/**
 * HTTP client：统一 /api/v1 前缀、token 注入、响应体解析、稳定错误码映射、Idempotency-Key。
 * 契约：docs/API接口设计-短视频管理与播放系统.md §1。
 */
import { ApiResponse, ErrorCode } from './types';

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '';
const API_PREFIX = '/api/v1';

export class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public httpStatus: number,
    public traceId?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

const TOKEN_KEY = 'yingliu.app.token';

export const tokenStore = {
  get(): string | null {
    return localStorage.getItem(TOKEN_KEY);
  },
  set(token: string) {
    localStorage.setItem(TOKEN_KEY, token);
  },
  clear() {
    localStorage.removeItem(TOKEN_KEY);
  },
};

/** 是否需要登录（当前无 token） */
export function isAuthenticated(): boolean {
  return tokenStore.get() != null;
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  body?: unknown;
  /** 需要幂等写入时携带，服务端据此去重 */
  idempotencyKey?: string;
  signal?: AbortSignal;
}

/** 业务码需登录取会话的场景（错误码 → 需跳转登录） */
const AUTH_CODES = new Set<string>([ErrorCode.AUTH_REQUIRED, ErrorCode.TOKEN_EXPIRED]);

/**
 * 发请求并解析统一响应体。
 * - 非 2xx 或业务 code !== OK 时抛 ApiError（携带稳定业务码）
 * - 未登录 / 会话失效抛 ApiError，由调用方或全局拦截处理
 */
export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, idempotencyKey, signal } = options;
  const headers: Record<string, string> = { Accept: 'application/json' };
  const token = tokenStore.get();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  const response = await fetch(`${BASE_URL}${API_PREFIX}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal,
    credentials: 'include',
  });

  let payload: ApiResponse<unknown> | null = null;
  try {
    payload = (await response.json()) as ApiResponse<unknown>;
  } catch {
    // 非 JSON 响应（如网关错误页）
  }

  const traceId = payload?.traceId;
  if (!response.ok || !payload || payload.code !== ErrorCode.OK) {
    const code = payload?.code ?? 'HTTP_ERROR';
    const message = payload?.message ?? `请求失败（HTTP ${response.status}）`;
    const error = new ApiError(code, message, response.status, traceId);
    if (AUTH_CODES.has(code)) onAuthRequired();
    throw error;
  }
  return payload.data as T;
}

let authHandler: (() => void) | null = null;
/** 注册全局"需登录"回调（路由层跳登录页） */
export function setAuthRequiredHandler(handler: () => void) {
  authHandler = handler;
}

function onAuthRequired() {
  tokenStore.clear();
  authHandler?.();
}

/** 生成幂等键（互动写接口使用） */
export function createIdempotencyKey(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
