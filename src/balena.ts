export const RESOURCE_NAMES = [
  'application', 'application_config_variable', 'application_environment_variable',
  'application_tag', 'device', 'device_config_variable', 'device_environment_variable',
  'device_service_environment_variable', 'device_tag', 'device_type', 'organization',
  'organization_membership', 'release', 'release_tag', 'service',
  'service_environment_variable', 'service_install', 'team', 'team_application_access',
  'team_membership', 'user', 'whoami'
] as const;

export type Resource = typeof RESOURCE_NAMES[number];
export type Query = { top?: number; skip?: number; filter?: string; select?: string; expand?: string; orderby?: string };
type Fetcher = typeof fetch;

export class BalenaError extends Error {
  constructor(public readonly status: number, message: string, public readonly retryAfter?: string) {
    super(message);
    this.name = 'BalenaError';
  }
}

export function quoteOData(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

export class BalenaClient {
  private readonly baseUrl: URL;

  constructor(private readonly token: string, baseUrl = 'https://api.balena-cloud.com/v7/', private readonly fetcher: Fetcher = fetch) {
    if (!token.trim()) throw new Error('BALENA_API_TOKEN is required');
    this.baseUrl = new URL(baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`);
    if (this.baseUrl.protocol !== 'https:' && this.baseUrl.hostname !== '127.0.0.1' && this.baseUrl.hostname !== 'localhost') {
      throw new Error('BALENA_API_URL must use HTTPS outside localhost');
    }
    if (this.baseUrl.username || this.baseUrl.password || this.baseUrl.search || this.baseUrl.hash) {
      throw new Error('BALENA_API_URL must not contain credentials, query, or fragment');
    }
  }

  async list(resource: Resource, query: Query = {}): Promise<unknown> {
    const top = query.top ?? 25;
    const skip = query.skip ?? 0;
    if (!Number.isInteger(top) || top < 1 || top > 100 || !Number.isInteger(skip) || skip < 0) {
      throw new Error('Pagination requires top=1..100 and skip>=0');
    }
    const params = new URLSearchParams({ '$top': String(top), '$skip': String(skip) });
    if (query.filter) params.set('$filter', query.filter);
    if (query.select) params.set('$select', query.select);
    if (query.expand) params.set('$expand', query.expand);
    if (query.orderby) params.set('$orderby', query.orderby);
    return this.request('GET', resource, undefined, params);
  }

  get(resource: Resource, id: number): Promise<unknown> { return this.request('GET', resource, id); }
  whoami(): Promise<unknown> { return this.request('GET', 'whoami'); }
  create(resource: Resource, body: Record<string, unknown>): Promise<unknown> { return this.request('POST', resource, undefined, undefined, body); }
  update(resource: Resource, id: number, body: Record<string, unknown>): Promise<unknown> { return this.request('PATCH', resource, id, undefined, body); }
  remove(resource: Resource, id: number): Promise<unknown> { return this.request('DELETE', resource, id); }

  private async request(method: string, resource: Resource, id?: number, params?: URLSearchParams, body?: Record<string, unknown>): Promise<unknown> {
    if (!RESOURCE_NAMES.includes(resource)) throw new Error('Unsupported Balena resource');
    if (id !== undefined && (!Number.isSafeInteger(id) || id <= 0)) throw new Error('Resource id must be a positive integer');
    const url = new URL(`${resource}${id === undefined ? '' : `(${id})`}`, this.baseUrl);
    if (params) url.search = params.toString();
    const response = await this.fetcher(url, {
      method,
      headers: {
        Authorization: `Bearer ${this.token}`,
        Accept: 'application/json',
        ...(body ? { 'Content-Type': 'application/json' } : {})
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(30000)
    });
    const raw = await response.text();
    let parsed: unknown = raw;
    if (raw) {
      try { parsed = JSON.parse(raw); } catch { /* Preserve non-JSON error text. */ }
    }
    if (!response.ok) {
      const hint = response.status === 401 || response.status === 403 ? ' Check BALENA_API_TOKEN and its permissions.'
        : response.status === 429 ? ` Retry after ${response.headers.get('retry-after') ?? 'the server-specified delay'}.`
        : '';
      const message = typeof parsed === 'object' && parsed !== null && 'message' in parsed
        ? String(parsed.message) : typeof parsed === 'string' ? parsed.slice(0, 250) : response.statusText;
      throw new BalenaError(response.status, `Balena API ${response.status}: ${message.replaceAll(this.token, '[redacted]')}${hint}`, response.headers.get('retry-after') ?? undefined);
    }
    return parsed || { ok: true };
  }
}
