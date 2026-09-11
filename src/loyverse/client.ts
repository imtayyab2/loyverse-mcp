import { LoyverseApiError } from "./errors.js";

export const DEFAULT_API_BASE = "https://api.loyverse.com/v1.0";

/** Loyverse caps a page at 250 objects and defaults to 50. */
export const MAX_PAGE_LIMIT = 250;

export interface LoyverseClientOptions {
  accessToken: string;
  baseUrl?: string;
  timeoutMs?: number;
  /** Injected in tests. Defaults to global fetch. */
  fetchImpl?: typeof fetch;
  /** Injected in tests so retry backoff does not really sleep. */
  sleep?: (ms: number) => Promise<void>;
  maxRetries?: number;
}

export type QueryValue = string | number | boolean | string[] | undefined | null;
export type Query = Record<string, QueryValue>;

interface RequestOptions {
  method?: "GET" | "POST" | "DELETE";
  query?: Query;
  body?: unknown;
}

const RETRYABLE = new Set([429, 500, 502, 503, 504]);

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Thin transport over the Loyverse REST API.
 *
 * Holds a single access token and nothing else, so a remote deployment can
 * construct one per authenticated request without any shared state.
 */
export class LoyverseClient {
  private readonly accessToken: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly maxRetries: number;

  constructor(options: LoyverseClientOptions) {
    this.accessToken = options.accessToken;
    this.baseUrl = (options.baseUrl ?? DEFAULT_API_BASE).replace(/\/+$/, "");
    this.timeoutMs = options.timeoutMs ?? 30_000;
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch;
    this.sleep = options.sleep ?? defaultSleep;
    this.maxRetries = options.maxRetries ?? 3;
  }

  async request<T = unknown>(path: string, options: RequestOptions = {}): Promise<T> {
    const method = options.method ?? "GET";
    const url = this.buildUrl(path, options.query);

    let lastError: LoyverseApiError | undefined;
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      if (attempt > 0) {
        // 300 requests per 300 seconds, so back off in whole seconds.
        await this.sleep(Math.min(2 ** attempt * 1000, 8000));
      }
      try {
        return await this.send<T>(url, method, options.body);
      } catch (error) {
        if (error instanceof LoyverseApiError && RETRYABLE.has(error.status)) {
          lastError = error;
          continue;
        }
        throw error;
      }
    }
    throw lastError;
  }

  private async send<T>(url: string, method: string, body: unknown): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetchImpl(url, {
        method,
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          Accept: "application/json",
          ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: controller.signal,
      });

      const text = await response.text();
      const parsed = text ? safeJsonParse(text) : undefined;

      if (!response.ok) {
        const record = isRecord(parsed) ? parsed : undefined;
        throw new LoyverseApiError(
          response.status,
          typeof record?.["errors"] === "object"
            ? "API_ERROR"
            : String(record?.["code"] ?? response.statusText ?? "API_ERROR"),
          String(record?.["message"] ?? text ?? response.statusText),
          parsed,
        );
      }
      return (parsed ?? {}) as T;
    } finally {
      clearTimeout(timer);
    }
  }

  private buildUrl(path: string, query?: Query): string {
    const url = new URL(this.baseUrl + (path.startsWith("/") ? path : `/${path}`));
    for (const [key, value] of Object.entries(query ?? {})) {
      if (value === undefined || value === null || value === "") continue;
      url.searchParams.set(key, Array.isArray(value) ? value.join(",") : String(value));
    }
    return url.toString();
  }

  /**
   * Follow the cursor until the collection is exhausted or `maxItems` is
   * reached. `key` is the property holding the array, e.g. "receipts".
   */
  async listAll<T>(
    path: string,
    key: string,
    query: Query = {},
    maxItems = 1000,
  ): Promise<{ items: T[]; truncated: boolean }> {
    const items: T[] = [];
    let cursor: string | undefined;

    while (items.length < maxItems) {
      const page = await this.request<Record<string, unknown>>(path, {
        query: { ...query, limit: Math.min(MAX_PAGE_LIMIT, maxItems - items.length), cursor },
      });
      const batch = page[key];
      if (Array.isArray(batch)) items.push(...(batch as T[]));

      cursor = typeof page["cursor"] === "string" ? page["cursor"] : undefined;
      if (!cursor || !Array.isArray(batch) || batch.length === 0) {
        return { items, truncated: false };
      }
    }
    return { items: items.slice(0, maxItems), truncated: true };
  }
}

function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
