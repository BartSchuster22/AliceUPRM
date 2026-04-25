import { setTimeout as delay } from 'node:timers/promises';
import { signUprmRequest } from './signing.js';
import type { UprmClientConfig, UprmHttpRequest } from './types.js';

const DEFAULT_TIMEOUT_MS = 5_000;
const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_RETRY_DELAY_MS = 200;
const RETRYABLE_STATUS_CODES = new Set([408, 425, 429, 500, 502, 503, 504]);
const IDEMPOTENT_METHODS = new Set(['GET', 'HEAD', 'OPTIONS', 'PUT', 'DELETE']);

export class UprmHttpError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly responseBody: string,
    public readonly headers: Headers,
  ) {
    super(message);
    this.name = 'UprmHttpError';
  }
}

export class UprmHttpClient {
  private readonly baseUrl: URL;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;
  private readonly maxAttempts: number;
  private readonly retryDelayMs: number;
  private readonly userAgent: string;
  private readonly now: () => number;

  constructor(private readonly config: UprmClientConfig) {
    this.baseUrl = new URL(config.baseUrl);
    this.fetchImpl = config.fetch ?? fetch;
    this.timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.maxAttempts = config.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
    this.retryDelayMs = config.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS;
    this.userAgent = config.userAgent ?? '@uprm/uprm-client';
    this.now = config.now ?? Date.now;
  }

  async requestJson<T>(request: UprmHttpRequest): Promise<T> {
    const method = request.method.toUpperCase();
    const bodyString = toJsonBody(request.body);
    const idempotencyKey = resolveIdempotencyKey(
      request.idempotencyKey,
      request.headers,
      request.body,
    );
    const maxAttempts = Math.max(1, request.maxAttempts ?? this.maxAttempts);

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        const path = normalizePath(request.path);
        const signed = signUprmRequest({
          apiKey: this.config.apiKey,
          method,
          path,
          body: bodyString,
          now: this.now,
        });
        const headers = buildHeaders({
          authorization: signed.authorization,
          bodyString,
          userAgent: this.userAgent,
          ...(idempotencyKey ? { idempotencyKey } : {}),
          ...(request.headers ? { headers: request.headers } : {}),
        });

        const response = await this.fetchWithTimeout(
          new URL(path, this.baseUrl),
          {
            method,
            headers,
            ...(bodyString.length > 0 ? { body: bodyString } : {}),
            ...(request.signal ? { signal: request.signal } : {}),
          },
          request.timeoutMs ?? this.timeoutMs,
        );

        if (response.ok) {
          return await parseSuccessResponse<T>(response);
        }

        const responseBody = await response.text();
        const error = new UprmHttpError(
          `UPRM request failed (${response.status}): ${responseBody || response.statusText}`,
          response.status,
          responseBody || response.statusText,
          response.headers,
        );

        if (attempt < maxAttempts && isRetryableResponse(method, idempotencyKey, response.status)) {
          await waitBeforeRetry(attempt, this.retryDelayMs, response.headers);
          continue;
        }

        throw error;
      } catch (error) {
        if (attempt < maxAttempts && isRetryableError(method, idempotencyKey, error)) {
          await waitBeforeRetry(attempt, this.retryDelayMs);
          continue;
        }
        throw error;
      }
    }

    throw new Error('UPRM request exhausted retries without returning a result');
  }

  private async fetchWithTimeout(
    url: URL,
    init: RequestInit,
    timeoutMs: number,
  ): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(new Error('UPRM request timed out')),
      timeoutMs,
    );

    try {
      const signal = mergeAbortSignals(init.signal, controller.signal);
      return await this.fetchImpl(url, { ...init, signal });
    } finally {
      clearTimeout(timeout);
    }
  }
}

function normalizePath(path: string): string {
  return path.startsWith('/') ? path : `/${path}`;
}

function toJsonBody(body: unknown): string {
  if (body == null) {
    return '';
  }
  if (typeof body === 'string') {
    return body;
  }
  return JSON.stringify(body);
}

function buildHeaders(input: {
  authorization: string;
  bodyString: string;
  idempotencyKey?: string;
  userAgent: string;
  headers?: HeadersInit;
}): Headers {
  const headers = new Headers(input.headers ?? {});
  headers.set('Accept', 'application/json');
  headers.set('Authorization', input.authorization);
  headers.set('User-Agent', input.userAgent);

  if (input.bodyString.length > 0 && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  if (input.idempotencyKey) {
    headers.set('Idempotency-Key', input.idempotencyKey);
  }

  return headers;
}

function resolveIdempotencyKey(
  explicitKey: string | undefined,
  headers: HeadersInit | undefined,
  body: unknown,
): string | undefined {
  if (explicitKey) {
    return explicitKey;
  }

  const requestHeaders = new Headers(headers ?? {});
  const headerKey = requestHeaders.get('Idempotency-Key');
  if (headerKey) {
    return headerKey;
  }

  if (typeof body === 'object' && body !== null && 'idempotencyKey' in body) {
    const bodyKey = (body as { idempotencyKey?: unknown }).idempotencyKey;
    if (typeof bodyKey === 'string' && bodyKey.length > 0) {
      return bodyKey;
    }
  }

  return undefined;
}

async function parseSuccessResponse<T>(response: Response): Promise<T> {
  if (response.status === 204) {
    return undefined as T;
  }

  const responseText = await response.text();
  if (responseText.length === 0) {
    return undefined as T;
  }

  try {
    return JSON.parse(responseText) as T;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`UPRM returned invalid JSON (${response.status}): ${message}`);
  }
}

function isRetryableResponse(
  method: string,
  idempotencyKey: string | undefined,
  status: number,
): boolean {
  if (!RETRYABLE_STATUS_CODES.has(status)) {
    return false;
  }
  return IDEMPOTENT_METHODS.has(method) || Boolean(idempotencyKey);
}

function isRetryableError(
  method: string,
  idempotencyKey: string | undefined,
  error: unknown,
): boolean {
  if (error instanceof UprmHttpError) {
    return false;
  }
  if (error instanceof DOMException && error.name === 'AbortError') {
    return IDEMPOTENT_METHODS.has(method) || Boolean(idempotencyKey);
  }
  if (error instanceof TypeError) {
    return IDEMPOTENT_METHODS.has(method) || Boolean(idempotencyKey);
  }
  return false;
}

async function waitBeforeRetry(
  attempt: number,
  retryDelayMs: number,
  headers?: Headers,
): Promise<void> {
  const retryAfterHeader = headers?.get('Retry-After');
  const retryAfterMs = retryAfterHeader ? parseRetryAfterMs(retryAfterHeader) : null;
  const backoffMs = retryAfterMs ?? retryDelayMs * 2 ** (attempt - 1);
  await delay(backoffMs);
}

function parseRetryAfterMs(value: string): number | null {
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return seconds * 1000;
  }

  const retryAt = Date.parse(value);
  if (Number.isNaN(retryAt)) {
    return null;
  }

  return Math.max(0, retryAt - Date.now());
}

function mergeAbortSignals(
  primary: AbortSignal | null | undefined,
  secondary: AbortSignal,
): AbortSignal {
  if (!primary) {
    return secondary;
  }
  if (primary.aborted) {
    return primary;
  }

  const controller = new AbortController();
  const abort = (event: Event) => {
    const target = event.target;
    const reason = target instanceof AbortSignal ? target.reason : undefined;
    controller.abort(reason);
  };

  primary.addEventListener('abort', abort, { once: true });
  secondary.addEventListener('abort', abort, { once: true });
  return controller.signal;
}
