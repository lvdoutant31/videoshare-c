const API_PREFIX = '/api/v1';
const DEFAULT_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '';
const encoder = new TextEncoder();
const decoder = new TextDecoder();

export interface EncryptedRequestOptions {
  baseUrl?: string;
  fetcher?: typeof fetch;
  authorization?: string;
  signal?: AbortSignal;
}

interface PublicKeyData {
  v: '1';
  kid: string;
  alg: 'RSA-OAEP-256';
  enc: 'A256GCM';
  format: 'spki';
  publicKey: string;
  expiresAt: number;
}

interface EncryptedResponse {
  v: '1';
  kid: string;
  enc: 'A256GCM';
  requestId: string;
  timestamp: number;
  iv: string;
  ciphertext: string;
}

export async function encryptedRequest<T>(
  path: string,
  body: unknown,
  options: EncryptedRequestOptions = {},
): Promise<T> {
  const fetcher = options.fetcher ?? globalThis.fetch.bind(globalThis);
  const baseUrl = options.baseUrl ?? DEFAULT_BASE_URL;
  const authorization = options.authorization ?? '';
  const keyInfo = await fetchPublicKey(fetcher, baseUrl, options.signal);
  const publicKey = await crypto.subtle.importKey(
    'spki', bytes(keyInfo.publicKey), { name: 'RSA-OAEP', hash: 'SHA-256' }, false, ['encrypt'],
  );
  const aesKey = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
  const requestId = crypto.randomUUID();
  const timestamp = Date.now();
  const requestPath = `${API_PREFIX}${path}`;
  const aad = await makeAad(requestPath, keyInfo.kid, timestamp, requestId, authorization);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: aad, tagLength: 128 }, aesKey, encoder.encode(JSON.stringify(body)),
  );
  const rawKey = await crypto.subtle.exportKey('raw', aesKey);
  const encryptedKey = await crypto.subtle.encrypt({ name: 'RSA-OAEP' }, publicKey, rawKey);

  const response = await fetcher(`${baseUrl}${requestPath}`, {
    method: 'POST',
    credentials: 'include',
    signal: options.signal,
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/vnd.yingliu.encrypted+json',
      ...(authorization ? { Authorization: authorization } : {}),
    },
    body: JSON.stringify({
      v: '1', kid: keyInfo.kid, alg: keyInfo.alg, enc: keyInfo.enc, requestId, timestamp,
      encryptedKey: b64(encryptedKey), iv: b64(iv), ciphertext: b64(ciphertext),
    }),
  });
  if (!response.ok) throw await responseError(response);

  const envelope = await response.json() as EncryptedResponse;
  if (envelope.v !== '1' || envelope.kid !== keyInfo.kid || envelope.requestId !== requestId
      || envelope.timestamp !== timestamp || envelope.enc !== 'A256GCM') {
    throw new Error('加密响应元数据不匹配');
  }
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: bytes(envelope.iv), additionalData: aad, tagLength: 128 },
    aesKey,
    bytes(envelope.ciphertext),
  );
  return JSON.parse(decoder.decode(plaintext)) as T;
}

async function fetchPublicKey(fetcher: typeof fetch, baseUrl: string, signal?: AbortSignal) {
  const response = await fetcher(`${baseUrl}${API_PREFIX}/crypto/public-key`, {
    headers: { Accept: 'application/json' }, credentials: 'include', signal,
  });
  const envelope = await response.json() as { code?: string; message?: string; data?: PublicKeyData };
  if (!response.ok || envelope.code !== 'OK' || !envelope.data) {
    throw new Error(envelope.message || '获取接口加密公钥失败');
  }
  return envelope.data;
}

async function makeAad(
  path: string,
  kid: string,
  timestamp: number,
  requestId: string,
  authorization: string,
) {
  const authHash = authorization
    ? b64(await crypto.subtle.digest('SHA-256', encoder.encode(authorization)))
    : '';
  return encoder.encode(['v1', 'POST', path, kid, String(timestamp), requestId, authHash].join('\n'));
}

async function responseError(response: Response) {
  try {
    const body = await response.json() as { message?: string };
    return new Error(body.message || `加密请求失败（HTTP ${response.status}）`);
  } catch {
    return new Error(`加密请求失败（HTTP ${response.status}）`);
  }
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
  const padding = '='.repeat((4 - value.length % 4) % 4);
  const binary = atob((value + padding).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(binary, char => char.charCodeAt(0));
}
