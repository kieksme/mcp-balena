import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const json = (path: string) => JSON.parse(read(path)) as Record<string, unknown>;

describe('release identity', () => {
  it('uses the service-first package name and GPL license in every package manifest', () => {
    const pkg = json('../package.json');
    const mcpb = json('../mcpb/manifest.json');
    const claude = json('../.claude-plugin/plugin.json');
    const release = json('../release-please-config.json');

    expect(pkg.name).toBe('@kieksme/balena-mcp');
    expect(pkg.bin).toEqual({ 'balena-mcp': 'dist/index.js' });
    expect(mcpb.name).toBe('balena-mcp');
    expect(claude.name).toBe('balena-mcp');
    expect(mcpb.version).toBe(pkg.version);
    expect(claude.version).toBe(pkg.version);
    expect(pkg.license).toBe('GPL-3.0-or-later');
    expect(mcpb.license).toBe(pkg.license);
    expect(claude.license).toBe(pkg.license);
    expect(read('../LICENSE')).toContain('GNU GENERAL PUBLIC LICENSE');
    expect(release.packages).toMatchObject({ '.': { component: 'mcp-balena', 'package-name': pkg.name } });
  });

  it('publishes the service-first image and MCPB asset', () => {
    const workflow = read('../.github/workflows/release.yml');
    const readme = read('../README.md');

    expect(workflow).toContain('ghcr.io/kieksme/balena-mcp:latest');
    expect(workflow).toContain('artifacts/balena-mcp.mcpb');
    expect(readme).toContain('https://www.npmjs.com/package/@kieksme/balena-mcp');
    expect(readme).toContain('ghcr.io/kieksme/balena-mcp:latest');
    expect(readme).toContain('releases/latest/download/balena-mcp.mcpb');
  });
});
