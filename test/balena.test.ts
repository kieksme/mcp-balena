import { describe, expect, it, vi } from 'vitest';
import { BalenaClient, BalenaError, quoteOData } from '../src/balena.js';

describe('BalenaClient', () => {
  it('uses bearer auth, a bounded page, and escaped OData parameters', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ d: [{ id: 3 }] }), { status: 200 }));
    const client = new BalenaClient('test-secret', undefined, fetcher as typeof fetch);
    expect(await client.list('device', { top: 10, skip: 5, filter: `device_name eq ${quoteOData("O'Neil")}` })).toEqual({ d: [{ id: 3 }] });
    const [url, options] = fetcher.mock.calls[0] as unknown as [URL, RequestInit];
    expect(url.pathname).toBe('/v7/device');
    expect(url.searchParams.get('$top')).toBe('10');
    expect(url.searchParams.get('$skip')).toBe('5');
    expect(url.searchParams.get('$filter')).toBe("device_name eq 'O''Neil'");
    expect((options.headers as Record<string, string>).Authorization).toBe('Bearer test-secret');
  });

  it('sends narrowly targeted PATCH and DELETE requests', async () => {
    const fetcher = vi.fn(async () => new Response(null, { status: 204 }));
    const client = new BalenaClient('token', undefined, fetcher as typeof fetch);
    await client.update('device', 42, { device_name: 'Gateway' });
    await client.remove('device', 42);
    const [patchUrl, patchOptions] = fetcher.mock.calls[0] as unknown as [URL, RequestInit];
    expect(patchUrl.pathname).toBe('/v7/device(42)');
    expect(patchOptions.method).toBe('PATCH');
    expect(JSON.parse(String(patchOptions.body))).toEqual({ device_name: 'Gateway' });
    expect((fetcher.mock.calls[1] as unknown as [URL, RequestInit])[1].method).toBe('DELETE');
  });

  it('rejects invalid pagination and unsafe API URLs', async () => {
    const client = new BalenaClient('token');
    await expect(client.list('device', { top: 101 })).rejects.toThrow('top=1..100');
    expect(() => new BalenaClient('token', 'http://example.com/v7/')).toThrow('HTTPS');
  });

  it('returns actionable rate-limit errors without leaking the token', async () => {
    const fetcher = vi.fn(async () => new Response('slow down', { status: 429, headers: { 'Retry-After': '30' } }));
    const client = new BalenaClient('secret', undefined, fetcher as typeof fetch);
    await expect(client.list('device')).rejects.toMatchObject<Partial<BalenaError>>({ status: 429, retryAfter: '30' });
    await expect(client.list('device')).rejects.toThrow('Retry after 30');
  });

  it('redacts a token echoed by an upstream error', async () => {
    const fetcher = vi.fn(async () => new Response('bad token secret-value', { status: 401 }));
    const client = new BalenaClient('secret-value', undefined, fetcher as typeof fetch);
    await expect(client.whoami()).rejects.toThrow('bad token [redacted]');
  });
});
