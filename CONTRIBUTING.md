# Contributing

This file is for development and release work. See [README.md](README.md) for installation and use.

## Local development

Use Node.js 22 or newer and pnpm 10. Commit with Conventional Commits (`feat:`, `fix:`, `docs:`, etc.); Release Please uses these to propose version changes.

```bash
pnpm install --frozen-lockfile
pnpm typecheck
pnpm build
pnpm test
pnpm bundle:mcpb
pnpm smoke:mcpb
```

`src/balena.ts` contains the Balena v7 API client and its resource allowlist. `src/server.ts` registers tools and Zod schemas. `src/http.ts` enforces HTTP bearer auth and host/origin checks. `src/index.ts` selects stdio or HTTP using `MCP_TRANSPORT`. Tool errors are returned as MCP tool errors, while startup configuration errors terminate the process.

Use fixed responses in tests; never commit real Balena tokens, MCP bearer tokens, or customer data. Add a focused test when changing a tool, its API path or body, or a transport boundary. The ten read-only cases in `evaluations/` provide stable tool-use checks without a live Balena account.

## Packaging

`pnpm bundle:mcpb` creates `artifacts/mcp-balena.mcpb` from the built server and production dependencies. The manifest lives in `mcpb/manifest.json` and requests the Balena API key as a sensitive user input. `pnpm pack --pack-destination artifacts` checks the npm tarball. The Dockerfile runs the HTTP transport and requires both tokens at runtime.

## Release and deployment

CI runs on PRs and `main`. Release Please opens a release PR when Conventional Commits land on `main`. Merge that PR after CI passes: `.github/workflows/release.yml` then publishes the same tagged version to npm (`@kieksme/mcp-balena` under the `kieksme` npm organization), GitHub Packages, GHCR, and the `.mcpb` GitHub Release asset.

The npm publish job uses the existing organization-level `NPM_TOKEN` secret. It must belong to a user with publish rights in the `kieksme` npm organization, such as `vergissberlin`; package access is public. GitHub Packages and GHCR use the repository's `GITHUB_TOKEN`. Check the npm package owner and both registries after the first release. Release Please also updates the MCPB manifest and Claude plugin versions.

For local HTTP testing:

```bash
BALENA_API_TOKEN=test-token MCP_HTTP_AUTH_TOKEN=local-test-token \
  MCP_TRANSPORT=http pnpm start
```

The default host is `127.0.0.1` and the default port is `3000`. A public bind requires `MCP_HTTP_ALLOWED_HOSTS`; terminate TLS at a reverse proxy. HTTP requests to `/mcp` require the bearer token even on localhost.
