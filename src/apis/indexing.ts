// Indexing API v3 — urlNotifications publish + getMetadata.
// Discovery: indexing.googleapis.com/$discovery/rest?version=v3 (revision 20260907).
// Part of the gsc-mcp surface this CLI replaces; one scope: `indexing`.
// The coverage-oracle in test/indexing.test.ts fails if this drops/gains a method.
import type { Manifest } from '../types.ts';

const I = ['indexing'];

export default {
  api: 'indexing',
  baseUrl: 'https://indexing.googleapis.com',
  resources: {
    'url-notifications': {
      // POST body: { url, type: URL_UPDATED | URL_DELETED }.
      publish: { httpMethod: 'POST', pathTemplate: '/v3/urlNotifications:publish', scopes: I },
      // GET ?url= ; the url is a trailing positional (query seam), not a path param.
      'get-metadata': {
        httpMethod: 'GET',
        pathTemplate: '/v3/urlNotifications/metadata',
        scopes: I,
        query: ['url'],
      },
    },
  },
} satisfies Manifest;
