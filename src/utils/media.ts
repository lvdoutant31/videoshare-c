/** 返回已生成的封面；未配置时交给视频元素显示真实预览帧。 */
export function resolveCoverUrl(coverUrl: string | null | undefined): string | undefined {
  return coverUrl?.trim() || undefined;
}
