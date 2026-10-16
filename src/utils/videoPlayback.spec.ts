import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadVideoAt } from './videoPlayback';

afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });
function media() {
  const video = document.createElement('video');
  Object.defineProperty(video, 'duration', { value: 100, configurable: true });
  vi.spyOn(video, 'load').mockImplementation(() => undefined);
  return video;
}
describe('quality source loading', () => {
  it('restores position and speed after metadata, and waits for playable data', async () => {
    const video = media();
    const pending = loadVideoAt(video, '/hd.mp4', 42, 1.5, new AbortController().signal);
    video.dispatchEvent(new Event('loadedmetadata'));
    expect(video.currentTime).toBe(42); expect(video.playbackRate).toBe(1.5);
    video.dispatchEvent(new Event('canplay'));
    await pending;
  });
  it('rejects decode failures so the player can restore the previous source', async () => {
    const video = media();
    const result = expect(loadVideoAt(video, '/broken.mp4', 10, 1, new AbortController().signal)).rejects.toThrow('SOURCE_FAILED');
    video.dispatchEvent(new Event('error')); await result;
  });
  it('cancels listeners and timeout when the player is disposed', async () => {
    vi.useFakeTimers(); const video = media(); const controller = new AbortController();
    const result = expect(loadVideoAt(video, '/hd.mp4', 10, 1, controller.signal)).rejects.toThrow('ABORTED');
    controller.abort(); await result;
    video.dispatchEvent(new Event('loadedmetadata')); expect(video.currentTime).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });
  it('times out instead of leaving the quality button permanently disabled', async () => {
    vi.useFakeTimers();
    const result = expect(loadVideoAt(media(), '/slow.mp4', 0, 1, new AbortController().signal)).rejects.toThrow('SOURCE_TIMEOUT');
    await vi.advanceTimersByTimeAsync(15_000); await result;
  });
});
