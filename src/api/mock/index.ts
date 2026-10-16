/**
 * Mock 适配层：VITE_USE_MOCK=true 时使用本地数据，联调时切 false 走真实接口。
 * 接口函数签名与真实 API 模块一一对应，替换成本为零。
 */

/** 是否启用 mock（默认开启） */
export const USE_MOCK = import.meta.env.VITE_USE_MOCK !== 'false';

/** 模拟网络延迟，让加载态可见、交互可感知 */
export function delay(ms = 200): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** 模拟分页：从全量列表切出 limit 条并生成 nextCursor */
export function paginate<T>(items: T[], cursor: string | null, limit: number): { items: T[]; nextCursor: string | null } {
  const start = cursor ? Number(cursor) : 0;
  const slice = items.slice(start, start + limit);
  const next = start + limit < items.length ? String(start + limit) : null;
  return { items: slice, nextCursor: next };
}

/** 模拟服务端计数（互动的权威值） */
export function countAfter(active: boolean, count: number): { active: boolean; count: number } {
  return { active, count: Math.max(0, count + (active ? 1 : -1)) };
}
