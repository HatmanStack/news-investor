import { Environment } from '@/config/environment';

const BACKEND_TIMEOUT = 30000;

export class HttpError extends Error {
  response: { status: number; data: unknown };
  config: { url?: string };

  constructor(status: number, data: unknown, url?: string) {
    super(`Request failed with status ${status}`);
    this.name = 'HttpError';
    this.response = { status, data };
    this.config = { url };
  }
}

export function isHttpError(error: unknown): error is HttpError {
  return error instanceof HttpError;
}

interface RequestOptions {
  params?: Record<string, string | number | boolean | undefined>;
  responseType?: 'json' | 'text';
}

interface HttpResponse<T = unknown> {
  data: T;
  status: number;
}

interface HttpClient {
  get<T = unknown>(url: string, options?: RequestOptions): Promise<HttpResponse<T>>;
  post<T = unknown>(
    url: string,
    body?: unknown,
    options?: RequestOptions,
  ): Promise<HttpResponse<T>>;
  put<T = unknown>(url: string, body?: unknown, options?: RequestOptions): Promise<HttpResponse<T>>;
  delete<T = unknown>(url: string, options?: RequestOptions): Promise<HttpResponse<T>>;
}

let cachedClient: HttpClient | null = null;

async function request<T>(
  method: string,
  baseURL: string,
  path: string,
  body?: unknown,
  options?: RequestOptions,
): Promise<HttpResponse<T>> {
  let url = `${baseURL}${path}`;
  if (options?.params) {
    const searchParams = new URLSearchParams();
    for (const [key, value] of Object.entries(options.params)) {
      if (value !== undefined) searchParams.append(key, String(value));
    }
    const qs = searchParams.toString();
    if (qs) url += `?${qs}`;
  }

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), BACKEND_TIMEOUT);

  try {
    const response = await fetch(url, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });

    if (!response.ok) {
      let errorData: unknown;
      try {
        errorData = await response.json();
      } catch {
        errorData = await response.text().catch(() => null);
      }
      throw new HttpError(response.status, errorData, path);
    }

    const isText = options?.responseType === 'text';
    const data = isText ? await response.text() : await response.json();

    return { data: data as T, status: response.status };
  } finally {
    clearTimeout(timeout);
  }
}

export function createBackendClient(): HttpClient {
  if (cachedClient) return cachedClient;

  if (!Environment.BACKEND_URL) {
    throw new Error('Backend URL not configured. Set EXPO_PUBLIC_BACKEND_URL in .env file.');
  }

  const baseURL = Environment.BACKEND_URL;

  const client: HttpClient = {
    get<T>(url: string, options?: RequestOptions) {
      return request<T>('GET', baseURL, url, undefined, options);
    },
    post<T>(url: string, body?: unknown, options?: RequestOptions) {
      return request<T>('POST', baseURL, url, body, options);
    },
    put<T>(url: string, body?: unknown, options?: RequestOptions) {
      return request<T>('PUT', baseURL, url, body, options);
    },
    delete<T>(url: string, options?: RequestOptions) {
      return request<T>('DELETE', baseURL, url, undefined, options);
    },
  };

  cachedClient = client;
  return client;
}
