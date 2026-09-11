// Google Tag Manager API v2 — full surface. T4a added the core families
// (navigate accounts → containers → workspaces, plus CRUD of the workspace
// entities tags/triggers/variables/folders). T4b (this revision) completes the
// advanced surface: container/workspace/version writes, publish, version
// headers, the remaining workspace entities (templates/transformations/clients/
// zones/gtag_config/built_in_variables), destinations, environments,
// user_permissions (manage.users) and accounts.update (manage.accounts).
// Discovery: tagmanager.googleapis.com/$discovery/rest?version=v2 (rev 20260909).
// Deprecated methods are NOT connected: containers.combine, containers.move_tag_id,
// destinations.link, destinations.get (all flagged `deprecated: true` in discovery).
// The coverage-oracle in test/gtm.test.ts fails if any non-deprecated v2 method
// lacks a row, or a deprecated one sneaks in.
// Scopes (least-privilege per row, all still requested at consent): reads take
// `tagmanager.readonly`; most writes `tagmanager.edit.containers`; version writes
// `tagmanager.edit.containerversions`; publish/reauthorize `tagmanager.publish`;
// container/workspace deletes `tagmanager.delete.containers`; accounts.update
// `tagmanager.manage.accounts`; user_permissions `tagmanager.manage.users`. Each
// is among the scopes discovery lists as accepted for that method.
import type { Manifest, ManifestRow } from '../types.ts';

const R = ['tagmanager.readonly'];
const E = ['tagmanager.edit.containers'];
const EV = ['tagmanager.edit.containerversions'];
const P = ['tagmanager.publish'];
const DC = ['tagmanager.delete.containers'];
const MA = ['tagmanager.manage.accounts'];
const MU = ['tagmanager.manage.users'];

// GTM nests accounts → containers → workspaces → entities.
const A = '/tagmanager/v2/accounts';
const C = `${A}/{account}/containers/{container}`;
const WS = `${C}/workspaces/{workspace}`;

type Verbs = Record<string, ManifestRow>;

// Full CRUD for a collection: list + item get/update/delete + create. `listKey`
// is both the response array key and the item path placeholder. `scopes` is the
// write scope (reads always take R).
const crud = (base: string, name: string, listKey: string, write = E): Verbs => ({
  list: { httpMethod: 'GET', pathTemplate: `${base}/${name}`, scopes: R, listKey },
  get: { httpMethod: 'GET', pathTemplate: `${base}/${name}/{${listKey}}`, scopes: R },
  create: { httpMethod: 'POST', pathTemplate: `${base}/${name}`, scopes: write },
  update: { httpMethod: 'PUT', pathTemplate: `${base}/${name}/{${listKey}}`, scopes: write },
  delete: { httpMethod: 'DELETE', pathTemplate: `${base}/${name}/{${listKey}}`, scopes: write },
});

// Workspace entity = CRUD + a revert action on the item path.
const wsEntity = (name: string, listKey: string): Verbs => ({
  ...crud(WS, name, listKey),
  revert: { httpMethod: 'POST', pathTemplate: `${WS}/${name}/{${listKey}}:revert`, scopes: E },
});

export default {
  api: 'gtm',
  baseUrl: 'https://tagmanager.googleapis.com',
  resources: {
    accounts: {
      list: { httpMethod: 'GET', pathTemplate: A, scopes: R, listKey: 'account' },
      get: { httpMethod: 'GET', pathTemplate: `${A}/{account}`, scopes: R },
      update: { httpMethod: 'PUT', pathTemplate: `${A}/{account}`, scopes: MA },
    },
    'user-permissions': {
      list: {
        httpMethod: 'GET',
        pathTemplate: `${A}/{account}/user_permissions`,
        scopes: MU,
        listKey: 'userPermission',
      },
      get: {
        httpMethod: 'GET',
        pathTemplate: `${A}/{account}/user_permissions/{userPermission}`,
        scopes: MU,
      },
      create: { httpMethod: 'POST', pathTemplate: `${A}/{account}/user_permissions`, scopes: MU },
      update: {
        httpMethod: 'PUT',
        pathTemplate: `${A}/{account}/user_permissions/{userPermission}`,
        scopes: MU,
      },
      delete: {
        httpMethod: 'DELETE',
        pathTemplate: `${A}/{account}/user_permissions/{userPermission}`,
        scopes: MU,
      },
    },
    containers: {
      list: {
        httpMethod: 'GET',
        pathTemplate: `${A}/{account}/containers`,
        scopes: R,
        listKey: 'container',
      },
      get: { httpMethod: 'GET', pathTemplate: C, scopes: R },
      create: { httpMethod: 'POST', pathTemplate: `${A}/{account}/containers`, scopes: E },
      update: { httpMethod: 'PUT', pathTemplate: C, scopes: E },
      delete: { httpMethod: 'DELETE', pathTemplate: C, scopes: DC },
      // lookup is account-less: resolve a container by tagId or destinationId.
      lookup: {
        httpMethod: 'GET',
        pathTemplate: `${A}/containers:lookup`,
        scopes: R,
        query: ['tagId', 'destinationId'],
      },
      snippet: { httpMethod: 'GET', pathTemplate: `${C}:snippet`, scopes: R },
    },
    destinations: {
      // get + link are deprecated; only list is connected.
      list: {
        httpMethod: 'GET',
        pathTemplate: `${C}/destinations`,
        scopes: R,
        listKey: 'destination',
      },
    },
    environments: {
      ...crud(C, 'environments', 'environment'),
      reauthorize: {
        httpMethod: 'POST',
        pathTemplate: `${C}/environments/{environment}:reauthorize`,
        scopes: P,
      },
    },
    versions: {
      // No list/create: version_headers lists, workspaces create_version creates.
      get: { httpMethod: 'GET', pathTemplate: `${C}/versions/{version}`, scopes: R },
      live: { httpMethod: 'GET', pathTemplate: `${C}/versions:live`, scopes: R },
      update: { httpMethod: 'PUT', pathTemplate: `${C}/versions/{version}`, scopes: EV },
      delete: { httpMethod: 'DELETE', pathTemplate: `${C}/versions/{version}`, scopes: EV },
      publish: { httpMethod: 'POST', pathTemplate: `${C}/versions/{version}:publish`, scopes: P },
      'set-latest': {
        httpMethod: 'POST',
        pathTemplate: `${C}/versions/{version}:set_latest`,
        scopes: E,
      },
      undelete: {
        httpMethod: 'POST',
        pathTemplate: `${C}/versions/{version}:undelete`,
        scopes: EV,
      },
    },
    'version-headers': {
      list: {
        httpMethod: 'GET',
        pathTemplate: `${C}/version_headers`,
        scopes: R,
        listKey: 'containerVersionHeader',
      },
      latest: { httpMethod: 'GET', pathTemplate: `${C}/version_headers:latest`, scopes: R },
    },
    workspaces: {
      list: { httpMethod: 'GET', pathTemplate: `${C}/workspaces`, scopes: R, listKey: 'workspace' },
      get: { httpMethod: 'GET', pathTemplate: WS, scopes: R },
      create: { httpMethod: 'POST', pathTemplate: `${C}/workspaces`, scopes: E },
      update: { httpMethod: 'PUT', pathTemplate: WS, scopes: E },
      delete: { httpMethod: 'DELETE', pathTemplate: WS, scopes: DC },
      status: { httpMethod: 'GET', pathTemplate: `${WS}/status`, scopes: R },
      'create-version': { httpMethod: 'POST', pathTemplate: `${WS}:create_version`, scopes: EV },
      'bulk-update': { httpMethod: 'POST', pathTemplate: `${WS}/bulk_update`, scopes: E },
      'quick-preview': { httpMethod: 'POST', pathTemplate: `${WS}:quick_preview`, scopes: EV },
      'resolve-conflict': { httpMethod: 'POST', pathTemplate: `${WS}:resolve_conflict`, scopes: E },
      sync: { httpMethod: 'POST', pathTemplate: `${WS}:sync`, scopes: E },
    },
    'built-in-variables': {
      // No get/update. Create/delete/revert act on the collection, keyed by
      // ?type=. delete removes an enabled built-in by type.
      list: {
        httpMethod: 'GET',
        pathTemplate: `${WS}/built_in_variables`,
        scopes: R,
        listKey: 'builtInVariable',
      },
      create: {
        httpMethod: 'POST',
        pathTemplate: `${WS}/built_in_variables`,
        scopes: E,
        query: ['type'],
      },
      delete: {
        httpMethod: 'DELETE',
        pathTemplate: `${WS}/built_in_variables`,
        scopes: E,
        query: ['type'],
      },
      revert: {
        httpMethod: 'POST',
        pathTemplate: `${WS}/built_in_variables:revert`,
        scopes: E,
        query: ['type'],
      },
    },
    folders: {
      ...crud(WS, 'folders', 'folder'),
      revert: { httpMethod: 'POST', pathTemplate: `${WS}/folders/{folder}:revert`, scopes: E },
      entities: { httpMethod: 'POST', pathTemplate: `${WS}/folders/{folder}:entities`, scopes: R },
      'move-entities': {
        httpMethod: 'POST',
        pathTemplate: `${WS}/folders/{folder}:move_entities_to_folder`,
        scopes: E,
      },
    },
    tags: wsEntity('tags', 'tag'),
    triggers: wsEntity('triggers', 'trigger'),
    variables: wsEntity('variables', 'variable'),
    clients: wsEntity('clients', 'client'),
    transformations: wsEntity('transformations', 'transformation'),
    zones: wsEntity('zones', 'zone'),
    templates: {
      ...wsEntity('templates', 'template'),
      'import-from-gallery': {
        httpMethod: 'POST',
        pathTemplate: `${WS}/templates:import_from_gallery`,
        scopes: E,
      },
    },
    // gtag_config has no revert action.
    'gtag-config': crud(WS, 'gtag_config', 'gtagConfig'),
  },
} satisfies Manifest;
