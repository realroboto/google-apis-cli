import type { ApiEntry } from '../../../src/types.ts';

// Like the shipped business-* entries: the document has no auth section, so the entry declares the scopes.
export default {
  api: 'business',
  discovery: 'https://business.invalid/$discovery/rest?version=v1', // never resolves (RFC 6761)
  scopes: ['business.manage'],
} satisfies ApiEntry;
