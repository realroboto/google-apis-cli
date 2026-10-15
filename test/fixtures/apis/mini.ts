import type { ApiEntry } from '../../../src/types.ts';

export default {
  api: 'mini',
  discovery: 'https://mini.invalid/$discovery/rest?version=v1', // never resolves (RFC 6761)
} satisfies ApiEntry;
