import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';

const root = resolve(import.meta.dirname, '..');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const manifest = JSON.parse(readFileSync(join(root, 'mcpb/manifest.json'), 'utf8'));
if (manifest.version !== pkg.version) throw new Error('MCPB and package versions differ');
const stage = mkdtempSync(join(tmpdir(), 'balena-mcpb-'));
const output = join(root, 'artifacts', 'balena-mcp.mcpb');
try {
  mkdirSync(join(stage, 'server'), { recursive: true });
  mkdirSync(join(root, 'artifacts'), { recursive: true });
  cpSync(join(root, 'dist'), join(stage, 'server'), { recursive: true });
  cpSync(join(root, 'LICENSE'), join(stage, 'LICENSE'));
  writeFileSync(join(stage, 'manifest.json'), JSON.stringify(manifest, null, 2));
  const dependencies = Object.fromEntries(Object.keys(pkg.dependencies).map(name => [name, JSON.parse(readFileSync(join(root, 'node_modules', name, 'package.json'), 'utf8')).version]));
  writeFileSync(join(stage, 'package.json'), JSON.stringify({ name: pkg.name, version: pkg.version, type: 'module', packageManager: pkg.packageManager, dependencies }, null, 2));
  execFileSync('pnpm', ['install', '--prod', '--ignore-scripts', '--node-linker=hoisted'], { cwd: stage, stdio: 'inherit' });
  rmSync(join(stage, '.pnpm-store'), { recursive: true, force: true });
  execFileSync(join(root, 'node_modules/.bin/mcpb'), ['validate', stage], { cwd: root, stdio: 'inherit' });
  execFileSync(join(root, 'node_modules/.bin/mcpb'), ['pack', stage, output], { cwd: root, stdio: 'inherit' });
} finally {
  rmSync(stage, { recursive: true, force: true });
}
console.log(output);
