import { request } from './http';

export interface ContentOptions {
  categories: { id: string; name: string }[];
  tags: { id: string; name: string }[];
}

export interface MyContentItem {
  id: string; authorNickname: string; title: string; description: string | null; videoUrl: string | null; auditStatus: string; publishStatus: string;
  coverMedia: { url: string } | null; originalMedia: { url: string } | null; createdAt: string; updatedAt: string;
  likeCount?: number; playCount?: number;
}

export function getMyContent() {
  return request<MyContentItem[]>('/app/me/content');
}

export type ContentStatus = 'ALL' | 'PUBLISHED' | 'REVIEW' | 'REVISION' | 'OFF_SHELF' | 'UNPUBLISHED';

export function getMyContentPage(status: ContentStatus = 'PUBLISHED', cursor: string | null = null, limit = 20) {
  const query = new URLSearchParams({ status, limit: String(limit) });
  if (cursor) query.set('cursor', cursor);
  return request<{ items: MyContentItem[]; nextCursor: string | null; total: number }>(`/app/me/content/page?${query}`);
}

export function getEditableContent(id: string) {
  return request<MyContentItem & { currentVersion: number; categories: { id: string; name: string }[]; tags: { id: string; name: string }[] }>('/app/me/content/' + encodeURIComponent(id));
}

export function updateMyContent(id: string, input: { title: string; description: string; categoryIds: string[]; tagIds: string[]; currentVersion: number }) {
  return request<MyContentItem>(`/app/me/content/${encodeURIComponent(id)}`, { method: 'PUT', body: input });
}

export function offShelfMyContent(id: string) {
  return request<void>(`/app/me/content/${encodeURIComponent(id)}/off-shelf`, { method: 'POST' });
}

export function getContentOptions() {
  return request<ContentOptions>('/app/content/options');
}

export async function uploadContentImage(file: File) {
  const body = new FormData();
  body.append('file', file);
  const result = await request<{ url: string }>('/app/content/images', { method: 'POST', body });
  return result.url;
}

export function publishContent(input: { title: string; description: string; categoryIds: string[]; tagIds: string[]; file?: File }, onUploadProgress?: (percent: number) => void) {
  const body = new FormData();
  body.append('title', input.title);
  body.append('description', input.description);
  input.categoryIds.forEach(id => body.append('categoryIds', id));
  input.tagIds.forEach(id => body.append('tagIds', id));
  if (input.file) body.append('file', input.file);
  return request<{ id: string; auditStatus: string }>('/app/content', { method: 'POST', body, onUploadProgress });
}
