import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';

const root = resolve(import.meta.dirname, '..');
const stage = mkdtempSync(join(tmpdir(), 'balena-mcpb-smoke-'));
try {
  execFileSync('unzip', ['-q', join(root, 'artifacts/balena-mcp.mcpb'), '-d', stage]);
  if (!readFileSync(join(stage, 'LICENSE'), 'utf8').includes('GNU GENERAL PUBLIC LICENSE')) {
    throw new Error('Bundled MCP is missing the GPLv3 license');
  }
  const client = new Client({ name: 'bundle-smoke', version: '1.0.0' });
  const transport = new StdioClientTransport({
    command: 'node', args: [join(stage, 'server/index.js')],
    env: { ...process.env, BALENA_API_TOKEN: 'bundle-smoke-token', MCP_TRANSPORT: 'stdio' }
  });
  await client.connect(transport);
  const names = (await client.listTools()).tools.map(tool => tool.name);
  if (!names.includes('balena_list_devices')) throw new Error('Bundled MCP cannot list Balena tools');
  await client.close();
  console.log(`MCPB smoke test passed with ${names.length} tools`);
} finally {
  rmSync(stage, { recursive: true, force: true });
}
