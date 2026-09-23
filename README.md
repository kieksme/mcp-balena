<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/kieksme/skills/main/skills/platform/mcp-builder/templates/assets/kieks-me-banner-dark.svg">
    <img alt="kieks.me" src="https://raw.githubusercontent.com/kieksme/skills/main/skills/platform/mcp-builder/templates/assets/kieks-me-banner-light.svg" width="280">
  </picture>
</p>

# Balena MCP

[![CI](https://github.com/kieksme/mcp-balena/actions/workflows/ci.yml/badge.svg)](https://github.com/kieksme/mcp-balena/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/%40kieksme%2Fbalena-mcp)](https://www.npmjs.com/package/@kieksme/balena-mcp)

Manage [Balena](https://www.balena.io/) fleets, devices, releases, variables, tags, teams, and organizations from Claude, VS Code, and other MCP clients. The server runs locally over stdio or remotely over token-protected Streamable HTTP.

## Add to your MCP client

[![Get for Claude Desktop](https://img.shields.io/badge/Claude_Desktop-Get_extension-D97757?logo=anthropic&logoColor=white)](https://github.com/kieksme/mcp-balena/releases/latest/download/balena-mcp.mcpb)
[![Install in VS Code](https://img.shields.io/badge/VS_Code-Install_server-007ACC?logo=visualstudiocode&logoColor=white)](vscode:mcp/install?%7B%22name%22%3A%22balena%22%2C%22type%22%3A%22stdio%22%2C%22command%22%3A%22npx%22%2C%22args%22%3A%5B%22-y%22%2C%22%40kieksme%2Fbalena-mcp%22%5D%2C%22env%22%3A%7B%22BALENA_API_TOKEN%22%3A%22%24%7Benv%3ABALENA_API_TOKEN%7D%22%7D%7D)

First, create a **named API key** in [Balena account preferences](https://dashboard.balena-cloud.com/preferences?tab=details). It has the permissions of your Balena user account. Keep it private.

- **Claude Desktop:** Download the `.mcpb` extension with the button and open it in Claude Desktop. Enter your Balena API key when prompted. The download becomes available with the first GitHub release.
- **VS Code:** Set `BALENA_API_TOKEN` in the environment from which VS Code starts, then use the button. Alternatively, copy the repository's [`.vscode/mcp.json`](.vscode/mcp.json), which prompts for the token as a password field.
- **Claude Code:** Install the marketplace plugin. It prompts for the Balena API key:

  ```text
  /plugin marketplace add kieksme/mcp-balena
  /plugin install balena-mcp@mcp-balena
  ```

To run the package directly with any stdio MCP client:

```json
{
  "mcpServers": {
    "balena": {
      "command": "npx",
      "args": ["-y", "@kieksme/balena-mcp"],
      "env": { "BALENA_API_TOKEN": "YOUR_BALENA_API_TOKEN" }
    }
  }
}
```

## What it can do

| Area | Tools and examples |
| --- | --- |
| Fleets | List and inspect fleets, create or rename a fleet, set its target release, delete a fleet |
| Devices | List and inspect devices, rename, add notes, pin releases, move or delete devices |
| Releases and services | Inspect releases and services, update release notes |
| Variables | List, create, update, and delete fleet, device, service, and config variables |
| Tags | List, create, update, and delete device, fleet, and release tags |
| Organizations and teams | List organizations, teams, and members; create teams and manage memberships |
| Other API resources | Read a bounded page with `balena_query_resource` using Balena OData filters |

Read tools return at most 25 records by default; `top` accepts 1–100 and `skip` selects the next page. Tools that delete resources or change a whole fleet require `confirm: true`. The generic query tool is read-only and excludes API-key management.

Try asking your MCP client: “Show my fleets”, “Which devices in fleet 42 are offline?”, or “List the latest releases for fleet 42.”

## Run over Streamable HTTP

Set two separate secrets: `BALENA_API_TOKEN` for Balena and `MCP_HTTP_AUTH_TOKEN` for clients connecting to this MCP server.

```bash
docker run --rm -p 127.0.0.1:3000:3000 \
  -e BALENA_API_TOKEN=YOUR_BALENA_API_TOKEN \
  -e MCP_HTTP_AUTH_TOKEN=YOUR_LONG_RANDOM_MCP_TOKEN \
  ghcr.io/kieksme/balena-mcp:latest
```

The MCP endpoint is `http://127.0.0.1:3000/mcp`; `GET /health` provides an unauthenticated health check. Send `Authorization: Bearer <MCP_HTTP_AUTH_TOKEN>` on MCP requests. The server refuses HTTP mode without that token.

For a public deployment, put HTTPS in front of the container and set `MCP_HTTP_ALLOWED_HOSTS` to the external hostname, for example `balena-mcp.example.com,localhost,127.0.0.1`. No hosted service is included with the package.

The package is published as [`@kieksme/balena-mcp` on npm](https://www.npmjs.com/package/@kieksme/balena-mcp) and [GitHub Packages](https://github.com/orgs/kieksme/packages/npm/balena-mcp). The repository remains [`kieksme/mcp-balena`](https://github.com/kieksme/mcp-balena). Development and release instructions are in [CONTRIBUTING.md](CONTRIBUTING.md).

## License

GPL-3.0-or-later. See [LICENSE](LICENSE).
