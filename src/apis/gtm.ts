// Google Tag Manager API v2 — core families (T4a): navigate accounts →
// containers → workspaces, and full CRUD of the workspace entities tags,
// triggers, variables, folders. Discovery:
// tagmanager.googleapis.com/$discovery/rest?version=v2 (revision 20260909).
// T4b extends this same file (container/workspace/version writes, publish,
// user_permissions, etc). The coverage-oracle in test/gtm.test.ts freezes the
// T4a subset — it fails if a core-family method is dropped or an out-of-scope
// method sneaks in.
// Scopes (least-privilege per row, all still requested at consent): reads take
// `tagmanager.readonly`; entity writes take `tagmanager.edit.containers`. Both
// are among the scopes discovery lists as accepted for these methods.
import type { Manifest } from '../types.ts';

const R = ['tagmanager.readonly'];
const E = ['tagmanager.edit.containers'];

// GTM nests entities under accounts/{account}/containers/{container}/workspaces/{workspace}.
const WS = '/tagmanager/v2/accounts/{account}/containers/{container}/workspaces/{workspace}';

// Full CRUD for a workspace entity (tags/triggers/variables/folders): the
// collection path, the item path, and the response list key are all it varies.
const crud = (name: string, listKey: string) => ({
  list: { httpMethod: 'GET' as const, pathTemplate: `${WS}/${name}`, scopes: R, listKey },
  get: { httpMethod: 'GET' as const, pathTemplate: `${WS}/${name}/{${listKey}}`, scopes: R },
  create: { httpMethod: 'POST' as const, pathTemplate: `${WS}/${name}`, scopes: E },
  update: { httpMethod: 'PUT' as const, pathTemplate: `${WS}/${name}/{${listKey}}`, scopes: E },
  delete: { httpMethod: 'DELETE' as const, pathTemplate: `${WS}/${name}/{${listKey}}`, scopes: E },
});

export default {
  api: 'gtm',
  baseUrl: 'https://tagmanager.googleapis.com',
  resources: {
    accounts: {
      list: {
        httpMethod: 'GET',
        pathTemplate: '/tagmanager/v2/accounts',
        scopes: R,
        listKey: 'account',
      },
      get: { httpMethod: 'GET', pathTemplate: '/tagmanager/v2/accounts/{account}', scopes: R },
    },
    containers: {
      list: {
        httpMethod: 'GET',
        pathTemplate: '/tagmanager/v2/accounts/{account}/containers',
        scopes: R,
        listKey: 'container',
      },
      get: {
        httpMethod: 'GET',
        pathTemplate: '/tagmanager/v2/accounts/{account}/containers/{container}',
        scopes: R,
      },
    },
    workspaces: {
      list: {
        httpMethod: 'GET',
        pathTemplate: '/tagmanager/v2/accounts/{account}/containers/{container}/workspaces',
        scopes: R,
        listKey: 'workspace',
      },
      get: {
        httpMethod: 'GET',
        pathTemplate:
          '/tagmanager/v2/accounts/{account}/containers/{container}/workspaces/{workspace}',
        scopes: R,
      },
    },
    tags: crud('tags', 'tag'),
    triggers: crud('triggers', 'trigger'),
    variables: crud('variables', 'variable'),
    folders: crud('folders', 'folder'),
  },
} satisfies Manifest;
