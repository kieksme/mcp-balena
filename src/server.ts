import { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import { BalenaClient, RESOURCE_NAMES, quoteOData, type Resource } from './balena.js';

const id = z.number().int().positive();
const page = { top: z.number().int().min(1).max(100).default(25), skip: z.number().int().min(0).default(0) };
const confirmed = z.literal(true).describe('Must be true after reviewing the target and consequences');
const nonempty = z.string().trim().min(1).max(255);
const version = '0.3.0'; // x-release-please-version

function success(data: unknown) {
  const output = { data: data ?? null };
  return { content: [{ type: 'text' as const, text: JSON.stringify(output) }], structuredContent: output };
}

async function execute(operation: () => Promise<unknown>) {
  try { return success(await operation()); }
  catch (error) {
    return { isError: true, content: [{ type: 'text' as const, text: error instanceof Error ? error.message : 'Unknown Balena error' }] };
  }
}

const readonly = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true };
const write = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true };
const destructive = { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true };

export function createBalenaServer(client: BalenaClient): McpServer {
  const server = new McpServer({ name: 'balena-mcp-server', version });

  server.registerTool('balena_whoami', { description: 'Show the Balena account associated with the API token.', inputSchema: z.object({}), annotations: readonly },
    async () => execute(() => client.whoami()));

  server.registerTool('balena_query_resource', {
    description: 'Read a page of a documented Balena v7 OData resource. This tool never changes data. API keys and SSH keys are excluded.',
    inputSchema: z.object({ resource: z.enum(RESOURCE_NAMES), ...page, filter: z.string().max(500).optional(), select: z.string().max(300).optional(), expand: z.string().max(300).optional(), orderby: z.string().max(150).optional() }),
    annotations: readonly
  }, async ({ resource, top, skip, filter, select, expand, orderby }) => execute(() => client.list(resource, { top, skip, filter, select, expand, orderby })));

  const namedLists: { name: string; resource: Resource; description: string }[] = [
    { name: 'balena_list_organizations', resource: 'organization', description: 'List organizations visible to the API token.' },
    { name: 'balena_list_fleets', resource: 'application', description: 'List fleets associated with the authenticated user, excluding unrelated public fleets.' },
    { name: 'balena_list_releases', resource: 'release', description: 'List releases for a fleet.' },
    { name: 'balena_list_services', resource: 'service', description: 'List services for a fleet.' },
    { name: 'balena_list_teams', resource: 'team', description: 'List teams visible to the API token.' },
    { name: 'balena_list_team_memberships', resource: 'team_membership', description: 'List members of a team.' },
    { name: 'balena_list_organization_memberships', resource: 'organization_membership', description: 'List members of an organization.' },
    { name: 'balena_list_device_types', resource: 'device_type', description: 'List supported Balena device types.' }
  ];
  for (const item of namedLists) {
    server.registerTool(item.name, {
      description: item.description,
      inputSchema: z.object({ ...page, parent_id: id.optional().describe('Fleet, team, or organization ID when applicable') }), annotations: readonly
    }, async ({ top, skip, parent_id }) => execute(() => {
      const field = item.resource === 'release' || item.resource === 'service' ? 'belongs_to__application'
        : item.resource === 'team_membership' ? 'is_member_of__team'
        : item.resource === 'organization_membership' ? 'is_member_of__organization' : undefined;
      if (parent_id && !field) throw new Error('parent_id is not supported for this list');
      const filter = item.resource === 'application' ? 'is_directly_accessible_by__user/any(dau:true)'
        : parent_id && field ? `${field} eq ${parent_id}` : undefined;
      return client.list(item.resource, { top, skip, filter });
    }));
  }

  server.registerTool('balena_list_devices', { description: 'List devices, optionally restricted to one fleet.', inputSchema: z.object({ ...page, fleet_id: id.optional() }), annotations: readonly },
    async ({ top, skip, fleet_id }) => execute(() => client.list('device', { top, skip, filter: fleet_id ? `belongs_to__application eq ${fleet_id}` : undefined })));

  server.registerTool('balena_get_device', { description: 'Get one device by numeric ID, including its current status.', inputSchema: z.object({ device_id: id }), annotations: readonly },
    async ({ device_id }) => execute(() => client.get('device', device_id)));
  server.registerTool('balena_get_fleet', { description: 'Get one fleet by numeric ID.', inputSchema: z.object({ fleet_id: id }), annotations: readonly },
    async ({ fleet_id }) => execute(() => client.get('application', fleet_id)));
  server.registerTool('balena_get_release', { description: 'Get one release by numeric ID.', inputSchema: z.object({ release_id: id }), annotations: readonly },
    async ({ release_id }) => execute(() => client.get('release', release_id)));
  server.registerTool('balena_get_organization', { description: 'Get one organization by numeric ID.', inputSchema: z.object({ organization_id: id }), annotations: readonly },
    async ({ organization_id }) => execute(() => client.get('organization', organization_id)));
  server.registerTool('balena_get_team', { description: 'Get one team by numeric ID.', inputSchema: z.object({ team_id: id }), annotations: readonly },
    async ({ team_id }) => execute(() => client.get('team', team_id)));

  server.registerTool('balena_create_fleet', {
    description: 'Create a fleet in an organization for a device type.',
    inputSchema: z.object({ name: nonempty, organization_id: id, device_type_id: id }), annotations: write
  }, async ({ name, organization_id, device_type_id }) => execute(() => client.create('application', { app_name: name, organization: organization_id, is_for__device_type: device_type_id })));
  server.registerTool('balena_rename_fleet', { description: 'Rename a fleet.', inputSchema: z.object({ fleet_id: id, name: nonempty }), annotations: write },
    async ({ fleet_id, name }) => execute(() => client.update('application', fleet_id, { app_name: name })));
  server.registerTool('balena_set_fleet_release', {
    description: 'Pin an entire fleet to a release. This changes the target for all unpinned devices; confirm the fleet and release first.',
    inputSchema: z.object({ fleet_id: id, release_id: id, confirm: confirmed }), annotations: destructive
  }, async ({ fleet_id, release_id }) => execute(() => client.update('application', fleet_id, { should_be_running__release: release_id, should_track_latest_release: false })));
  server.registerTool('balena_delete_fleet', { description: 'Permanently delete a fleet. Review its devices before confirming.', inputSchema: z.object({ fleet_id: id, confirm: confirmed }), annotations: destructive },
    async ({ fleet_id }) => execute(() => client.remove('application', fleet_id)));

  server.registerTool('balena_rename_device', { description: 'Rename a device.', inputSchema: z.object({ device_id: id, name: nonempty }), annotations: write },
    async ({ device_id, name }) => execute(() => client.update('device', device_id, { device_name: name })));
  server.registerTool('balena_set_device_note', { description: 'Set a device note.', inputSchema: z.object({ device_id: id, note: z.string().max(2000) }), annotations: write },
    async ({ device_id, note }) => execute(() => client.update('device', device_id, { note })));
  server.registerTool('balena_pin_device_release', { description: 'Pin a device to a release, or pass null to return to fleet tracking.', inputSchema: z.object({ device_id: id, release_id: id.nullable() }), annotations: write },
    async ({ device_id, release_id }) => execute(() => client.update('device', device_id, { is_pinned_on__release: release_id })));
  server.registerTool('balena_move_device', { description: 'Move a device to a different fleet. Confirm the destination fleet first.', inputSchema: z.object({ device_id: id, destination_fleet_id: id, confirm: confirmed }), annotations: destructive },
    async ({ device_id, destination_fleet_id }) => execute(() => client.update('device', device_id, { belongs_to__application: destination_fleet_id })));
  server.registerTool('balena_delete_device', { description: 'Permanently delete a device from Balena.', inputSchema: z.object({ device_id: id, confirm: confirmed }), annotations: destructive },
    async ({ device_id }) => execute(() => client.remove('device', device_id)));
  server.registerTool('balena_set_release_note', { description: 'Set the note on a release.', inputSchema: z.object({ release_id: id, note: z.string().max(2000) }), annotations: write },
    async ({ release_id, note }) => execute(() => client.update('release', release_id, { note })));

  const variableKinds = {
    fleet_environment: { resource: 'application_environment_variable', owner: 'application' },
    fleet_config: { resource: 'application_config_variable', owner: 'application' },
    device_environment: { resource: 'device_environment_variable', owner: 'device' },
    device_config: { resource: 'device_config_variable', owner: 'device' },
    service_environment: { resource: 'service_environment_variable', owner: 'service' },
    device_service_environment: { resource: 'device_service_environment_variable', owner: 'service_install' }
  } as const;
  const variableKind = z.enum(Object.keys(variableKinds) as [keyof typeof variableKinds, ...(keyof typeof variableKinds)[]]);
  server.registerTool('balena_list_variables', { description: 'List environment or config variables for a fleet, device, service, or service installation.', inputSchema: z.object({ kind: variableKind, owner_id: id, ...page }), annotations: readonly },
    async ({ kind, owner_id, top, skip }) => execute(() => {
      const spec = variableKinds[kind];
      return client.list(spec.resource, { top, skip, filter: `${spec.owner} eq ${owner_id}` });
    }));
  server.registerTool('balena_create_variable', { description: 'Create a named environment or config variable. Values may contain secrets; do not repeat them in chat.', inputSchema: z.object({ kind: variableKind, owner_id: id, name: nonempty, value: z.string() }), annotations: write },
    async ({ kind, owner_id, name, value }) => execute(() => {
      const spec = variableKinds[kind];
      return client.create(spec.resource, { [spec.owner]: owner_id, name, value });
    }));
  server.registerTool('balena_update_variable', { description: 'Update the value of an existing variable by ID.', inputSchema: z.object({ kind: variableKind, variable_id: id, value: z.string() }), annotations: write },
    async ({ kind, variable_id, value }) => execute(() => client.update(variableKinds[kind].resource, variable_id, { value })));
  server.registerTool('balena_delete_variable', { description: 'Delete one environment or config variable by ID.', inputSchema: z.object({ kind: variableKind, variable_id: id, confirm: confirmed }), annotations: destructive },
    async ({ kind, variable_id }) => execute(() => client.remove(variableKinds[kind].resource, variable_id)));

  const tagKind = z.enum(['device', 'fleet', 'release']);
  const tagResources = { device: 'device_tag', fleet: 'application_tag', release: 'release_tag' } as const;
  const tagOwners = { device: 'device', fleet: 'application', release: 'release' } as const;
  server.registerTool('balena_list_tags', { description: 'List tags attached to a device, fleet, or release.', inputSchema: z.object({ kind: tagKind, owner_id: id, ...page }), annotations: readonly },
    async ({ kind, owner_id, top, skip }) => execute(() => client.list(tagResources[kind], { top, skip, filter: `${tagOwners[kind]} eq ${owner_id}` })));
  server.registerTool('balena_create_tag', { description: 'Add a tag to a device, fleet, or release.', inputSchema: z.object({ kind: tagKind, owner_id: id, key: nonempty, value: z.string().max(2000) }), annotations: write },
    async ({ kind, owner_id, key, value }) => execute(() => client.create(tagResources[kind], { [tagOwners[kind]]: owner_id, tag_key: key, value })));
  server.registerTool('balena_update_tag', { description: 'Update a tag value by tag ID.', inputSchema: z.object({ kind: tagKind, tag_id: id, value: z.string().max(2000) }), annotations: write },
    async ({ kind, tag_id, value }) => execute(() => client.update(tagResources[kind], tag_id, { value })));
  server.registerTool('balena_delete_tag', { description: 'Delete one tag by ID.', inputSchema: z.object({ kind: tagKind, tag_id: id, confirm: confirmed }), annotations: destructive },
    async ({ kind, tag_id }) => execute(() => client.remove(tagResources[kind], tag_id)));

  server.registerTool('balena_create_team', { description: 'Create a team in an organization.', inputSchema: z.object({ organization_id: id, name: nonempty }), annotations: write },
    async ({ organization_id, name }) => execute(() => client.create('team', { belongs_to__organization: organization_id, name })));
  server.registerTool('balena_delete_team', { description: 'Permanently delete a team.', inputSchema: z.object({ team_id: id, confirm: confirmed }), annotations: destructive },
    async ({ team_id }) => execute(() => client.remove('team', team_id)));
  server.registerTool('balena_add_team_member', { description: 'Add a user to a team by numeric user ID.', inputSchema: z.object({ team_id: id, user_id: id }), annotations: write },
    async ({ team_id, user_id }) => execute(() => client.create('team_membership', { is_member_of__team: team_id, user: user_id })));
  server.registerTool('balena_remove_team_member', { description: 'Remove one team membership by numeric membership ID.', inputSchema: z.object({ membership_id: id, confirm: confirmed }), annotations: destructive },
    async ({ membership_id }) => execute(() => client.remove('team_membership', membership_id)));
  server.registerTool('balena_add_organization_member', { description: 'Add a user to an organization with a membership role ID.', inputSchema: z.object({ organization_id: id, user_id: id, role_id: id }), annotations: write },
    async ({ organization_id, user_id, role_id }) => execute(() => client.create('organization_membership', { is_member_of__organization: organization_id, user: user_id, organization_membership_role: role_id })));
  server.registerTool('balena_remove_organization_member', { description: 'Remove one organization membership by numeric membership ID.', inputSchema: z.object({ membership_id: id, confirm: confirmed }), annotations: destructive },
    async ({ membership_id }) => execute(() => client.remove('organization_membership', membership_id)));
  server.registerTool('balena_find_device_by_name', { description: 'Find devices by exact name with safe OData quoting.', inputSchema: z.object({ name: nonempty, ...page }), annotations: readonly },
    async ({ name, top, skip }) => execute(() => client.list('device', { top, skip, filter: `device_name eq ${quoteOData(name)}` })));
  return server;
}
