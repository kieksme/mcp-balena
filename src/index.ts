#!/usr/bin/env node
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import { BalenaClient } from './balena.js';
import { createBalenaServer } from './server.js';
import { createHttpServer, parseHttpConfig } from './http.js';

async function main(): Promise<void> {
  const client = new BalenaClient(process.env.BALENA_API_TOKEN || '', process.env.BALENA_API_URL);
  const mode = process.env.MCP_TRANSPORT || 'stdio';
  if (mode === 'stdio') {
    await serveStdio(() => createBalenaServer(client));
  } else if (mode === 'http') {
    const config = parseHttpConfig();
    const server = createHttpServer(client, config);
    await new Promise<void>(resolve => server.listen(config.port, config.host, resolve));
    console.error(`Balena MCP listening on ${config.host}:${config.port}`);
    for (const signal of ['SIGTERM', 'SIGINT'] as const) process.once(signal, () => server.close());
  } else {
    throw new Error('MCP_TRANSPORT must be stdio or http');
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : 'Failed to start Balena MCP');
  process.exitCode = 1;
});
