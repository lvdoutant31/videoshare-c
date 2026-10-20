/** Wait until the replacement source can play at the retained position. */
export function loadVideoAt(video: HTMLVideoElement, url: string, position: number,
                            playbackRate: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) { reject(new Error('ABORTED')); return; }
    let metadataReady = false;
    const cleanup = () => {
      clearTimeout(timer);
      video.removeEventListener('loadedmetadata', metadata);
      video.removeEventListener('canplay', ready);
      video.removeEventListener('seeked', ready);
      video.removeEventListener('error', error);
      signal.removeEventListener('abort', abort);
    };
    const fail = (reason: string) => { cleanup(); reject(new Error(reason)); };
    const error = () => fail('SOURCE_FAILED');
    const abort = () => fail('ABORTED');
    const metadata = () => {
      if (!Number.isFinite(video.duration) || video.duration <= 0) { fail('INVALID_DURATION'); return; }
      metadataReady = true;
      video.currentTime = Math.min(Math.max(0, position), Math.max(0, video.duration - 0.05));
      video.playbackRate = playbackRate;
    };
    const ready = (event: Event) => {
      if (!metadataReady || video.seeking || (event.type === 'seeked' && video.readyState < 3)) return;
      cleanup(); resolve();
    };
    const timer = setTimeout(() => fail('SOURCE_TIMEOUT'), 15_000);
    video.addEventListener('loadedmetadata', metadata);
    video.addEventListener('canplay', ready);
    video.addEventListener('seeked', ready);
    video.addEventListener('error', error);
    signal.addEventListener('abort', abort, { once: true });
    try { video.src = url; video.load(); } catch { error(); }
  });
}
