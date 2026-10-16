import { afterEach, describe, expect, it, vi } from 'vitest';
import { createUuid } from './uuid';

afterEach(() => vi.unstubAllGlobals());

describe('createUuid', () => {
  it('uses the native implementation when available', () => {
    const randomUUID = vi.fn(() => '11111111-1111-4111-8111-111111111111' as `${string}-${string}-${string}-${string}-${string}`);
    vi.stubGlobal('crypto', { randomUUID });

    expect(createUuid()).toBe('11111111-1111-4111-8111-111111111111');
    expect(randomUUID).toHaveBeenCalledOnce();
  });

  it('creates a valid v4 UUID when randomUUID is unavailable', () => {
    vi.stubGlobal('crypto', {
      getRandomValues: (bytes: Uint8Array) => {
        bytes.fill(0xab);
        return bytes;
      },
    });

    expect(createUuid()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });
});
