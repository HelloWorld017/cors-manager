import type { InferInput } from "valibot";
import type { messageSchema } from './index';

const SIGNATURE = 'cors-manager' as const;
const INIT_TIMEOUT_MS = 10_000;
const CHECK_TIMEOUT_MS = 1_000;
const FETCH_TIMEOUT_MS = 30_000;

type DistributiveOmit<T, K extends PropertyKey> = T extends any
  ? Omit<T, K>
  : never;

type CorsManagerRequest = DistributiveOmit<InferInput<typeof messageSchema>, 'is' | 'messageId'>;
type CorsManagerReply = {
  is: typeof SIGNATURE;
  messageId: string;
  success: boolean;
  status?: number;
  statusText?: string;
  headers?: Array<[string, string]>;
  body?: Blob;
  reason?: unknown;
  isAllowed?: boolean;
};

let initialized = false;

const createMessageId = () => {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }

  return `${Date.now()}_${Math.random().toString(16).slice(2)}`;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const isCorsManagerReply = (value: unknown, messageId: string): value is CorsManagerReply => {
  if (!isRecord(value)) return false;
  if (value.is !== SIGNATURE) return false;
  if (value.messageId !== messageId) return false;
  if (typeof value.success !== 'boolean') return false;
  if ('kind' in value) return false;
  return true;
};

const sendMessage = (payload: CorsManagerRequest, timeoutMs: number | null): Promise<CorsManagerReply | null> => {
  if (typeof window === 'undefined') {
    return Promise.resolve(null);
  }

  const messageId = createMessageId();

  return new Promise(resolve => {
    const cleanup = () => {
      window.removeEventListener('message', onMessage);
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
      }
    };

    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      if (!isCorsManagerReply(event.data, messageId)) return;

      cleanup();
      resolve(event.data);
    };

    const timeoutId = timeoutMs !== null
      ? window.setTimeout(() => {
          cleanup();
          resolve(null);
        }, timeoutMs)
      : null;

    window.addEventListener('message', onMessage);

    try {
      window.postMessage({ is: SIGNATURE, messageId, ...payload }, window.location.origin);
    } catch {
      cleanup();
      resolve(null);
    }
  });
};

const toHeaderRecord = (headers: Headers): Record<string, string> | undefined => {
  const entries = Array.from(headers.entries());
  if (entries.length === 0) return undefined;
  return Object.fromEntries(entries);
};

const toHeaders = (pairs: CorsManagerReply['headers']): Headers => {
  const headers = new Headers();

  if (!Array.isArray(pairs)) {
    return headers;
  }

  for (const pair of pairs) {
    if (!Array.isArray(pair) || pair.length !== 2) continue;

    const [name, value] = pair;
    if (typeof name !== 'string' || name.length === 0) continue;
    if (typeof value !== 'string') continue;

    headers.append(name, value);
  }

  return headers;
};

export const initialize = async (timeout = true): Promise<boolean> => {
  const reply = await sendMessage({ kind: 'init' }, timeout ? INIT_TIMEOUT_MS : null);
  const success = reply?.success === true;
  initialized = success;
  return success;
};

export const isInitialized = (): boolean => {
  if (document.documentElement.dataset['cors-manager']) {
    initialized = true;
  }

  return initialized;
};

export const checkStatus = async (url: RequestInfo | URL): Promise<boolean> => {
  const request = new Request(url);
  const reply = await sendMessage(
    {
      kind: 'checkStatus',
      url: request.url
    },
    CHECK_TIMEOUT_MS
  );

  return !!reply?.isAllowed;
};

export const requestPermission = async (url: RequestInfo | URL): Promise<boolean> => {
  const request = new Request(url);
  const reply = await sendMessage(
    {
      kind: 'requestPermission',
      url: request.url
    },
    FETCH_TIMEOUT_MS
  );

  return !!reply?.success;
};

export const fetchCors = async (url: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  const request = new Request(url, init);
  const headers = toHeaderRecord(new Headers(request.headers));
  const body = request.body === null ? undefined : await request.blob();

  const reply = await sendMessage(
    {
      kind: 'fetch',
      method: request.method,
      url: request.url,
      ...(headers ? { headers } : {}),
      ...(body ? { body } : {}),
    },
    FETCH_TIMEOUT_MS
  );

  if (!reply) {
    throw new Error('Request timed out.');
  }

  if (!reply.success) {
    const reason = typeof reply.reason === 'string' ? reply.reason : 'unknown';
    throw new Error(`Request rejected: ${reason}`);
  }

  const responseBody = reply.body instanceof Blob ? reply.body : null;

  return new Response(responseBody, {
    status: reply.status,
    statusText: reply.statusText,
    headers: toHeaders(reply.headers),
  });
};
