import { describe, expect, it, vi } from 'vitest';
import { encryptedRequest } from './crypto';

const encoder = new TextEncoder();
describe('encryptedRequest', () => {
  it('completes an RSA-OAEP and AES-GCM echo round trip', async () => {
    const message = 'x'.repeat(128 * 1024);
    const authorization = 'Bearer test-token';
    const keys = await crypto.subtle.generateKey(
      { name: 'RSA-OAEP', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
      true,
      ['encrypt', 'decrypt'],
    ) as CryptoKeyPair;
    const spki = await crypto.subtle.exportKey('spki', keys.publicKey);
    const kid = 'test-key';

    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/api/v1/crypto/public-key')) {
        return Response.json({
          code: 'OK',
          data: { v: '1', kid, alg: 'RSA-OAEP-256', enc: 'A256GCM', format: 'spki', publicKey: b64(spki), expiresAt: Date.now() + 60_000 },
        });
      }

      const request = JSON.parse(String(init?.body)) as Envelope & { encryptedKey: string };
      const rawKey = await crypto.subtle.decrypt({ name: 'RSA-OAEP' }, keys.privateKey, bytes(request.encryptedKey));
      const aesKey = await crypto.subtle.importKey('raw', rawKey, 'AES-GCM', false, ['encrypt', 'decrypt']);
      const aad = await makeAad(
        request.timestamp,
        request.requestId,
        kid,
        new Headers(init?.headers).get('Authorization') ?? '',
      );
      const plaintext = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: bytes(request.iv), additionalData: aad, tagLength: 128 },
        aesKey,
        bytes(request.ciphertext),
      );
      const responseIv = crypto.getRandomValues(new Uint8Array(12));
      const ciphertext = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv: responseIv, additionalData: aad, tagLength: 128 },
        aesKey,
        plaintext,
      );
      return Response.json({
        v: '1', kid, enc: 'A256GCM', requestId: request.requestId, timestamp: request.timestamp,
        iv: b64(responseIv), ciphertext: b64(ciphertext),
      });
    });

    await expect(encryptedRequest<{ message: string }>('/crypto/test/echo', { message }, {
      fetcher,
      baseUrl: 'https://example.test',
      authorization,
    })).resolves.toEqual({ message });
  });
});

interface Envelope {
  requestId: string;
  timestamp: number;
  iv: string;
  ciphertext: string;
}

async function makeAad(timestamp: number, requestId: string, kid: string, authorization: string) {
  const authHash = authorization ? b64(await crypto.subtle.digest('SHA-256', encoder.encode(authorization))) : '';
  return encoder.encode(['v1', 'POST', '/api/v1/crypto/test/echo', kid, String(timestamp), requestId, authHash].join('\n'));
}

function b64(value: ArrayBuffer | Uint8Array) {
  const data = value instanceof Uint8Array ? value : new Uint8Array(value);
  let binary = '';
  for (let offset = 0; offset < data.length; offset += 0x8000) {
    binary += String.fromCharCode(...data.subarray(offset, offset + 0x8000));
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function bytes(value: string) {
  const binary = atob(value.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(binary, char => char.charCodeAt(0));
}
