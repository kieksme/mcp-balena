# Agent rules

1. Use Conventional Commits for every commit.
2. Use pnpm 10 for dependencies, builds, and tests; commit `pnpm-lock.yaml`.
3. Keep `README.md` focused on installation and use; put contributor instructions in `CONTRIBUTING.md`.
4. Never log or commit Balena credentials or MCP bearer tokens.
5. Add tests for API behavior and both transports when changing tools or authentication.
6. Keep release metadata, package version, and MCPB manifest version aligned through Release Please.
7. License original project code under GPL-3.0-or-later and retain the full GPLv3 text in `LICENSE`.
8. Keep the repository name `kieksme/mcp-balena`, but publish packages as `@kieksme/balena-mcp` and container images as `ghcr.io/kieksme/balena-mcp`.
