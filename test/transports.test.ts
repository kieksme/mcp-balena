import { afterEach, describe, expect, it, vi } from 'vitest';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { BalenaClient } from '../src/balena.js';
import { createHttpServer, parseHttpConfig } from '../src/http.js';

const fakeFetch = vi.fn(async () => new Response(JSON.stringify({ d: [{ id: 7, device_name: 'Test device' }] }), { status: 200 }));
const api = new BalenaClient('test-balena-token', undefined, fakeFetch as typeof fetch);
const servers: ReturnType<typeof createHttpServer>[] = [];

afterEach(async () => {
  for (const server of servers.splice(0)) await new Promise<void>(resolve => server.close(() => resolve()));
  fakeFetch.mockClear();
});

describe('HTTP transport', () => {
  it('requires an HTTP token and explicit allowed hosts for public bind', () => {
    expect(() => parseHttpConfig({ MCP_HTTP_HOST: '0.0.0.0' })).toThrow('MCP_HTTP_AUTH_TOKEN');
    expect(() => parseHttpConfig({ MCP_HTTP_HOST: '0.0.0.0', MCP_HTTP_AUTH_TOKEN: 'abc' })).toThrow('MCP_HTTP_ALLOWED_HOSTS');
  });

  it('rejects unauthenticated calls and serves authenticated MCP tools', async () => {
    const server = createHttpServer(api, { token: 'mcp-secret', host: '127.0.0.1', port: 0, allowedHosts: ['127.0.0.1'] });
    servers.push(server);
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Missing TCP address');
    const url = `http://127.0.0.1:${address.port}`;
    expect((await fetch(`${url}/health`)).status).toBe(200);
    expect((await fetch(`${url}/mcp`, { method: 'POST' })).status).toBe(401);
    expect((await fetch(`${url}/mcp`, { method: 'POST', headers: { Authorization: 'Bearer wrong' } })).status).toBe(401);
    expect((await fetch(`${url}/health`, { headers: { Origin: 'https://evil.example' } })).status).toBe(403);

    const client = new Client({ name: 'balena-test', version: '1.0.0' });
    const transport = new StreamableHTTPClientTransport(new URL(`${url}/mcp`), { requestInit: { headers: { Authorization: 'Bearer mcp-secret' } } });
    await client.connect(transport);
    const tools = await client.listTools();
    expect(tools.tools.map(tool => tool.name)).toContain('balena_list_devices');
    const result = await client.callTool({ name: 'balena_list_devices', arguments: { fleet_id: 5 } });
    expect(result.isError).not.toBe(true);
    expect(JSON.stringify(result)).toContain('Test device');
    const [requestUrl] = fakeFetch.mock.calls[0] as unknown as [URL];
    expect(requestUrl.searchParams.get('$filter')).toBe('belongs_to__application eq 5');
    await client.close();
  });

  it('validates destructive confirmation and maps variable writes to Balena fields', async () => {
    const server = createHttpServer(api, { token: 'mcp-secret', host: '127.0.0.1', port: 0, allowedHosts: ['127.0.0.1'] });
    servers.push(server);
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Missing TCP address');
    const client = new Client({ name: 'tool-test', version: '1.0.0' });
    await client.connect(new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${address.port}/mcp`), { requestInit: { headers: { Authorization: 'Bearer mcp-secret' } } }));
    const rejected = await client.callTool({ name: 'balena_delete_fleet', arguments: { fleet_id: 11 } });
    expect(rejected.isError).toBe(true);
    expect(fakeFetch).not.toHaveBeenCalled();
    await client.callTool({ name: 'balena_create_variable', arguments: { kind: 'device_environment', owner_id: 101, name: 'MODE', value: 'test' } });
    const [requestUrl, options] = fakeFetch.mock.calls[0] as unknown as [URL, RequestInit];
    expect(requestUrl.pathname).toBe('/v7/device_environment_variable');
    expect(options.method).toBe('POST');
    expect(JSON.parse(String(options.body))).toEqual({ device: 101, name: 'MODE', value: 'test' });
    await client.close();
  });

  it('supports the 2026 protocol era', async () => {
    const server = createHttpServer(api, { token: 'mcp-secret', host: '127.0.0.1', port: 0, allowedHosts: ['127.0.0.1'] });
    servers.push(server);
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Missing TCP address');
    const client = new Client({ name: 'modern-test', version: '1.0.0' }, { versionNegotiation: { mode: 'auto' } });
    await client.connect(new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${address.port}/mcp`), { requestInit: { headers: { Authorization: 'Bearer mcp-secret' } } }));
    expect((await client.listTools()).tools.length).toBeGreaterThan(20);
    await client.close();
  });
});

describe('stdio transport', () => {
  it('starts the published entry point without logging on stdout', async () => {
    const client = new Client({ name: 'stdio-test', version: '1.0.0' });
    const transport = new StdioClientTransport({
      command: 'node', args: ['dist/index.js'],
      env: { ...process.env, BALENA_API_TOKEN: 'test-balena-token', MCP_TRANSPORT: 'stdio' }
    });
    await client.connect(transport);
    expect((await client.listTools()).tools.map(tool => tool.name)).toContain('balena_whoami');
    await client.close();
  });
});
